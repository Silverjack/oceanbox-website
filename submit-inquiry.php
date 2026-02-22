<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'ok' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

// Replace with your Turnstile secret key, or set environment variable TURNSTILE_SECRET_KEY.
$turnstileSecret = getenv('TURNSTILE_SECRET_KEY') ?: '';
$recipient = 'rolly@oceanbox.cn';

$company = trim((string)($_POST['company'] ?? ''));
$email = trim((string)($_POST['email'] ?? ''));
$requirement = trim((string)($_POST['requirement'] ?? ''));
$honeypot = trim((string)($_POST['website'] ?? ''));
$turnstileToken = trim((string)($_POST['cf-turnstile-response'] ?? ''));
$devBypass = trim((string)($_POST['dev_bypass_turnstile'] ?? '')) === '1';
$remoteAddr = (string)($_SERVER['REMOTE_ADDR'] ?? '');
$host = (string)($_SERVER['HTTP_HOST'] ?? '');
$isLocalRequest = in_array($remoteAddr, ['127.0.0.1', '::1'], true)
    || str_starts_with($host, 'localhost')
    || str_starts_with($host, '127.0.0.1');
$skipTurnstile = $devBypass && $isLocalRequest;

if ($honeypot !== '') {
    http_response_code(200);
    echo json_encode([
        'ok' => true,
        'message' => 'Inquiry submitted successfully.'
    ]);
    exit;
}

if ($company === '' || $email === '' || $requirement === '') {
    http_response_code(422);
    echo json_encode([
        'ok' => false,
        'message' => 'Please complete all required fields.'
    ]);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode([
        'ok' => false,
        'message' => 'Please provide a valid email address.'
    ]);
    exit;
}

if (!$skipTurnstile && $turnstileToken === '') {
    http_response_code(422);
    echo json_encode([
        'ok' => false,
        'message' => 'Bot verification is required.'
    ]);
    exit;
}

if (!$skipTurnstile && $turnstileSecret === '') {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'message' => 'Server verification key is not configured.'
    ]);
    exit;
}

if (!$skipTurnstile) {
    $verifyPayload = http_build_query([
        'secret' => $turnstileSecret,
        'response' => $turnstileToken,
        'remoteip' => $_SERVER['REMOTE_ADDR'] ?? ''
    ]);

    $verifyResponse = false;
    if (function_exists('curl_init')) {
        $ch = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $verifyPayload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded']
        ]);
        $verifyResponse = curl_exec($ch);
        curl_close($ch);
    } else {
        $verifyResponse = @file_get_contents(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            false,
            stream_context_create([
                'http' => [
                    'method' => 'POST',
                    'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
                    'content' => $verifyPayload,
                    'timeout' => 10
                ]
            ])
        );
    }

    $verifyData = json_decode((string)$verifyResponse, true);
    if (!is_array($verifyData) || empty($verifyData['success'])) {
        http_response_code(422);
        echo json_encode([
            'ok' => false,
            'message' => 'Bot verification failed. Please try again.'
        ]);
        exit;
    }
}

$subject = 'New Website Inquiry - Oceanbox';
$body = "New inquiry received from Oceanbox website:\n\n"
    . "Company: {$company}\n"
    . "Email: {$email}\n\n"
    . "Requirement:\n{$requirement}\n\n"
    . "Submitted At (UTC): " . gmdate('Y-m-d H:i:s') . "\n";

$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'From: Oceanbox Website <no-reply@oceanbox.cn>',
    'Reply-To: ' . $email
];

$sent = @mail($recipient, $subject, $body, implode("\r\n", $headers));

if (!$sent) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'message' => 'Failed to send email. Please try again later.'
    ]);
    exit;
}

echo json_encode([
    'ok' => true,
    'message' => 'Thanks, your inquiry has been sent to our team.'
]);
