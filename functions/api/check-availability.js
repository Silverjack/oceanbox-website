const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const NO_STOCK_MESSAGE =
  "Sorry, we do not have inventory for this location at the moment.";

const isZipLike = (value = "") =>
  /^[0-9A-Za-z][0-9A-Za-z\- ]{2,10}$/.test(value) && /\d/.test(value);

const decodeHtmlEntities = (input = "") =>
  input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const normalizeLocationName = (input = "") => {
  let value = String(input || "").trim();
  if (!value) return "";

  if (value.includes(",")) {
    value = value.split(",")[0].trim();
  }

  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length > 1 && /^[A-Za-z]{2}$/.test(parts[parts.length - 1])) {
    parts.pop();
    value = parts.join(" ");
  }

  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const extractInventoryLocations = (html = "") => {
  const selectMatch = html.match(
    /<select[^>]*data-column=["']location["'][^>]*>([\s\S]*?)<\/select>/i
  );
  if (!selectMatch) return [];

  const locationOptions = [];
  const optionRegex = /<option[^>]*value="([^"]*)"[^>]*>/gi;
  let match;
  while ((match = optionRegex.exec(selectMatch[1]))) {
    const value = decodeHtmlEntities(match[1]).trim();
    if (!value) continue;
    const lower = value.toLowerCase();
    if (lower === "all" || lower === "all locations") continue;
    locationOptions.push(value);
  }
  return locationOptions;
};

export async function onRequestGet(context) {
  const { request } = context;
  const requestUrl = new URL(request.url);
  const rawLocation = String(requestUrl.searchParams.get("location") || "").trim();
  const rawZip = String(requestUrl.searchParams.get("zip") || "").trim();
  const rawQuery = String(requestUrl.searchParams.get("q") || "").trim();

  const query = rawLocation || rawZip || rawQuery;
  if (!query) {
    return jsonResponse(422, {
      ok: false,
      available: false,
      message: "Please enter a city or ZIP code.",
    });
  }

  const treatAsZip = rawZip ? true : !rawLocation && isZipLike(query);
  const targetUrl = new URL("https://inventory.oceanbox.cn/");
  if (treatAsZip) targetUrl.searchParams.set("zip", query);
  else targetUrl.searchParams.set("location", query);

  let inventoryResp;
  try {
    inventoryResp = await fetch(targetUrl.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch {
    return jsonResponse(502, {
      ok: false,
      available: false,
      message: "Unable to verify live inventory right now. Please try again shortly.",
    });
  }

  if (!inventoryResp.ok) {
    return jsonResponse(502, {
      ok: false,
      available: false,
      message: "Unable to verify live inventory right now. Please try again shortly.",
    });
  }

  const html = await inventoryResp.text().catch(() => "");
  if (!html) {
    return jsonResponse(502, {
      ok: false,
      available: false,
      message: "Unable to verify live inventory right now. Please try again shortly.",
    });
  }

  if (treatAsZip) {
    return jsonResponse(200, {
      ok: true,
      available: true,
      message: "Inventory lookup by ZIP is available.",
      url: targetUrl.toString(),
    });
  }

  const requestedCity = normalizeLocationName(rawLocation || query);
  const liveLocations = extractInventoryLocations(html);
  if (!requestedCity || liveLocations.length === 0) {
    return jsonResponse(502, {
      ok: false,
      available: false,
      message: "Unable to verify live inventory right now. Please try again shortly.",
    });
  }

  const liveLocationSet = new Set(
    liveLocations.map((item) => normalizeLocationName(item)).filter(Boolean)
  );

  if (!liveLocationSet.has(requestedCity)) {
    return jsonResponse(200, {
      ok: true,
      available: false,
      message: NO_STOCK_MESSAGE,
      url: targetUrl.toString(),
    });
  }

  return jsonResponse(200, {
    ok: true,
    available: true,
    message: "Inventory found for this location.",
    url: targetUrl.toString(),
  });
}
