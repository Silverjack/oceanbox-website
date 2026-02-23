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

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const hubspotRequest = async (token, path, options = {}) =>
  fetch(`https://api.hubapi.com${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });

const readHubspotError = async (resp, fallbackMessage) => {
  const text = await resp.text().catch(() => "");
  if (!text) return fallbackMessage;
  try {
    const parsed = JSON.parse(text);
    return parsed?.message || parsed?.error || fallbackMessage;
  } catch {
    return text || fallbackMessage;
  }
};

const readMailgunError = async (resp, fallbackMessage) => {
  const text = await resp.text().catch(() => "");
  if (!text) return fallbackMessage;
  try {
    const parsed = JSON.parse(text);
    return parsed?.message || parsed?.error || fallbackMessage;
  } catch {
    return text || fallbackMessage;
  }
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
  const turnstileSecret = env.TURNSTILE_SECRET_KEY || "";

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

  const hubspotToken = String(env.HUBSPOT_PRIVATE_APP_TOKEN || "").trim();
  if (!hubspotToken) {
    return jsonResponse(500, {
      ok: false,
      message: "HubSpot token is not configured.",
    });
  }

  if (/\s/.test(hubspotToken)) {
    return jsonResponse(500, {
      ok: false,
      message: "HubSpot token format is invalid (contains whitespace).",
    });
  }

  // Search existing contact by email.
  let searchResp;
  try {
    searchResp = await hubspotRequest(
      hubspotToken,
      "/crm/v3/objects/contacts/search",
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "email",
                  operator: "EQ",
                  value: email,
                },
              ],
            },
          ],
          properties: ["email", "company"],
          limit: 1,
        }),
      }
    );
  } catch {
    return jsonResponse(500, {
      ok: false,
      message: "Failed to reach HubSpot API. Check token value and network access.",
    });
  }

  if (!searchResp.ok) {
    const details = await readHubspotError(searchResp, "Failed to access HubSpot.");
    return jsonResponse(500, {
      ok: false,
      message: `HubSpot search failed: ${details}`,
    });
  }

  const searchJson = await searchResp.json().catch(() => null);
  const existingContactId = searchJson?.results?.[0]?.id || null;

  const contactPayload = {
    properties: {
      email,
      company,
    },
  };

  let contactResp;
  try {
    contactResp = existingContactId
      ? await hubspotRequest(
          hubspotToken,
          `/crm/v3/objects/contacts/${existingContactId}`,
          {
            method: "PATCH",
            body: JSON.stringify(contactPayload),
          }
        )
      : await hubspotRequest(hubspotToken, "/crm/v3/objects/contacts", {
          method: "POST",
          body: JSON.stringify(contactPayload),
        });
  } catch {
    return jsonResponse(500, {
      ok: false,
      message: "Failed to send contact data to HubSpot.",
    });
  }

  if (!contactResp.ok) {
    const details = await readHubspotError(contactResp, "Failed to save inquiry contact.");
    return jsonResponse(500, {
      ok: false,
      message: `HubSpot contact write failed: ${details}`,
    });
  }

  const contactJson = await contactResp.json().catch(() => null);
  const contactId = existingContactId || contactJson?.id;

  // Create inquiry note in HubSpot and associate it to the contact.
  const noteBody = [
    "<p><strong>New inquiry from website</strong></p>",
    `<p><strong>Company:</strong> ${company}</p>`,
    `<p><strong>Email:</strong> ${email}</p>`,
    `<p><strong>Requirement:</strong><br>${escapeHtml(requirement).replace(/\n/g, "<br>")}</p>`,
    `<p><strong>Submitted At (UTC):</strong> ${new Date().toISOString()}</p>`,
  ].join("");

  const notePayload = {
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_note_body: noteBody,
    },
  };

  if (contactId) {
    notePayload.associations = [
      {
        to: { id: contactId },
        types: [
          {
            associationCategory: "HUBSPOT_DEFINED",
            associationTypeId: 202,
          },
        ],
      },
    ];
  }

  let noteResp;
  try {
    noteResp = await hubspotRequest(hubspotToken, "/crm/v3/objects/notes", {
      method: "POST",
      body: JSON.stringify(notePayload),
    });
  } catch {
    return jsonResponse(500, {
      ok: false,
      message: "Failed to send inquiry note to HubSpot.",
    });
  }

  if (!noteResp.ok) {
    const details = await readHubspotError(
      noteResp,
      "Failed to create inquiry note in HubSpot."
    );
    return jsonResponse(500, {
      ok: false,
      message: `HubSpot note create failed: ${details}`,
    });
  }

  const mailSubject = `New Website Inquiry - ${company}`;
  const htmlContent = [
    "<h3>New inquiry from Oceanbox website</h3>",
    `<p><strong>Company:</strong> ${escapeHtml(company)}</p>`,
    `<p><strong>Email:</strong> ${escapeHtml(email)}</p>`,
    `<p><strong>Requirement:</strong><br>${escapeHtml(requirement).replace(/\n/g, "<br>")}</p>`,
    `<p><strong>Submitted At (UTC):</strong> ${new Date().toISOString()}</p>`,
  ].join("");

  const textContent = [
    "New inquiry from Oceanbox website",
    `Company: ${company}`,
    `Email: ${email}`,
    "Requirement:",
    requirement,
    `Submitted At (UTC): ${new Date().toISOString()}`,
  ].join("\n");

  const mailgunKey = String(env.MAILGUN_API_KEY || "").trim();
  const mailgunDomain = String(env.MAILGUN_DOMAIN || "").trim();
  const mailgunFromEmail = String(
    env.MAILGUN_FROM_EMAIL || `Oceanbox Website <no-reply@${mailgunDomain || "oceanbox.cn"}>`
  ).trim();
  const mailgunToEmail = String(env.MAILGUN_TO_EMAIL || "rolly@oceanbox.cn").trim();

  if (!mailgunKey || !mailgunDomain) {
    return jsonResponse(500, {
      ok: false,
      message:
        "Inquiry saved to HubSpot, but Mailgun is not configured. Set MAILGUN_API_KEY and MAILGUN_DOMAIN.",
    });
  }

  const auth = btoa(`api:${mailgunKey}`);
  const mailgunBody = new URLSearchParams({
    from: mailgunFromEmail,
    to: mailgunToEmail,
    subject: mailSubject,
    text: textContent,
    html: htmlContent,
    "h:Reply-To": email,
  });

  const mailgunResp = await fetch(
    `https://api.mailgun.net/v3/${encodeURIComponent(mailgunDomain)}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: mailgunBody.toString(),
    }
  );

  if (!mailgunResp.ok) {
    const details = await readMailgunError(
      mailgunResp,
      "Failed to send Mailgun notification email."
    );
    return jsonResponse(500, {
      ok: false,
      message: `Inquiry saved to HubSpot, but Mailgun send failed: ${details}`,
    });
  }

  return jsonResponse(200, {
    ok: true,
    message: "Thanks, your inquiry has been submitted successfully.",
  });
}
