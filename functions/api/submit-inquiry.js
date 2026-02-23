const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const isLocalHost = (host = "") =>
  host.startsWith("localhost") ||
  host.startsWith("127.0.0.1") ||
  host.startsWith("[::1]");

const readHubspotFormsError = async (resp, fallbackMessage) => {
  const text = await resp.text().catch(() => "");
  if (!text) return fallbackMessage;
  try {
    const parsed = JSON.parse(text);
    return parsed?.message || parsed?.errors?.[0]?.message || fallbackMessage;
  } catch {
    return text || fallbackMessage;
  }
};

const getCookieValue = (cookieHeader, key) => {
  if (!cookieHeader) return "";
  const parts = cookieHeader.split(";").map((item) => item.trim());
  const target = parts.find((item) => item.startsWith(`${key}=`));
  return target ? decodeURIComponent(target.slice(key.length + 1)) : "";
};

export async function onRequestPost(context) {
  const { request, env } = context;

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse(400, {
      ok: false,
      message: "Invalid form payload.",
    });
  }

  const company = String(formData.get("company") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const requirement = String(formData.get("requirement") || "").trim();
  const honeypot = String(formData.get("website") || "").trim();
  const turnstileToken = String(formData.get("cf-turnstile-response") || "").trim();
  const devBypass = String(formData.get("dev_bypass_turnstile") || "").trim() === "1";

  if (honeypot !== "") {
    return jsonResponse(200, {
      ok: true,
      message: "Thanks, your inquiry has been sent to our team.",
    });
  }

  if (!company || !email || !requirement) {
    return jsonResponse(422, {
      ok: false,
      message: "Please complete all required fields.",
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(422, {
      ok: false,
      message: "Please provide a valid email address.",
    });
  }

  const host = new URL(request.url).hostname;
  const localBypass = devBypass && isLocalHost(host);
  const turnstileSecret = String(env.TURNSTILE_SECRET_KEY || "").trim();

  if (!localBypass) {
    if (!turnstileToken) {
      return jsonResponse(422, {
        ok: false,
        message: "Bot verification is required.",
      });
    }

    if (!turnstileSecret) {
      return jsonResponse(500, {
        ok: false,
        message: "Server verification key is not configured.",
      });
    }

    const verifyPayload = new URLSearchParams({
      secret: turnstileSecret,
      response: turnstileToken,
      remoteip: request.headers.get("CF-Connecting-IP") || "",
    });

    const verifyResp = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: verifyPayload.toString(),
      }
    );

    const verifyJson = await verifyResp.json().catch(() => null);
    if (!verifyResp.ok || !verifyJson || verifyJson.success !== true) {
      return jsonResponse(422, {
        ok: false,
        message: "Bot verification failed. Please try again.",
      });
    }
  }

  const portalId = String(env.HUBSPOT_PORTAL_ID || "").trim();
  const formId = String(env.HUBSPOT_FORM_ID || "").trim();

  if (!portalId || !formId) {
    return jsonResponse(500, {
      ok: false,
      message:
        "HubSpot Forms is not configured. Please set HUBSPOT_PORTAL_ID and HUBSPOT_FORM_ID.",
    });
  }

  const fieldCompany = String(env.HUBSPOT_FIELD_COMPANY || "company").trim();
  const fieldEmail = String(env.HUBSPOT_FIELD_EMAIL || "email").trim();
  const fieldRequirement = String(env.HUBSPOT_FIELD_REQUIREMENT || "message").trim();

  const referer = request.headers.get("Referer") || "";
  const origin = request.headers.get("Origin") || "";
  const cookie = request.headers.get("Cookie") || "";
  const hutk = getCookieValue(cookie, "hubspotutk");

  const submitPayload = {
    submittedAt: Date.now().toString(),
    fields: [
      { name: fieldEmail, value: email },
      { name: fieldCompany, value: company },
      { name: fieldRequirement, value: requirement },
    ],
    context: {
      pageUri: referer || origin || `https://${host}/`,
      pageName: "Oceanbox Inquiry Form",
      ...(hutk ? { hutk } : {}),
    },
  };

  const hubspotToken = String(env.HUBSPOT_PRIVATE_APP_TOKEN || "").trim();
  const useSecureEndpoint = !!hubspotToken;
  const endpoint = useSecureEndpoint
    ? `https://api.hsforms.com/submissions/v3/integration/secure/submit/${encodeURIComponent(
        portalId
      )}/${encodeURIComponent(formId)}`
    : `https://api.hsforms.com/submissions/v3/integration/submit/${encodeURIComponent(
        portalId
      )}/${encodeURIComponent(formId)}`;

  const submitResp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(useSecureEndpoint ? { authorization: `Bearer ${hubspotToken}` } : {}),
    },
    body: JSON.stringify(submitPayload),
  });

  if (!submitResp.ok) {
    const details = await readHubspotFormsError(
      submitResp,
      "Failed to submit form to HubSpot."
    );
    return jsonResponse(500, {
      ok: false,
      message: `HubSpot Forms submit failed (${submitResp.status}): ${details}`,
    });
  }

  return jsonResponse(200, {
    ok: true,
    message: "Thanks, your inquiry has been submitted successfully.",
  });
}
