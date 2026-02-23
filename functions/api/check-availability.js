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

const defaultNoStockMarkers = [
  "no inventory",
  "no inventories",
  "no result",
  "no results",
  "no listing",
  "no listings",
  "no item",
  "no items",
  "not found",
  "sold out",
  "out of stock",
  "暂无库存",
  "暂无数据",
  "无库存",
  "没有库存",
  "未找到",
  "没有找到",
];

const isZipLike = (value = "") =>
  /^[0-9A-Za-z][0-9A-Za-z\- ]{2,10}$/.test(value) && /\d/.test(value);

const getNoStockMarkers = (env) => {
  const custom = String(env.INVENTORY_NO_STOCK_MARKERS || "").trim();
  if (!custom) return defaultNoStockMarkers;
  return custom
    .split("|")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
};

const hasNoStockSignals = (html, markers) => {
  const normalized = html.toLowerCase();
  if (markers.some((marker) => normalized.includes(marker))) return true;

  const zeroCountPattern =
    /(?:^|[^0-9])0+\s*(?:result|results|listing|listings|item|items|container|containers)\b/i;
  return zeroCountPattern.test(normalized);
};

const hasPositiveStockSignals = (html) => {
  const normalized = html.toLowerCase();
  const positiveCountPattern =
    /(?:^|[^0-9])([1-9][0-9]{0,5})\s*(?:result|results|listing|listings|item|items|container|containers)\b/i;
  return positiveCountPattern.test(normalized);
};

export async function onRequestGet(context) {
  const { request, env } = context;
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

  const noStockMarkers = getNoStockMarkers(env);
  const noStock = hasNoStockSignals(html, noStockMarkers);

  if (noStock) {
    return jsonResponse(200, {
      ok: true,
      available: false,
      message: NO_STOCK_MESSAGE,
      url: targetUrl.toString(),
    });
  }

  const positiveSignals = hasPositiveStockSignals(html);
  const assumeAvailableWhenUncertain =
    String(env.INVENTORY_ASSUME_AVAILABLE_WHEN_UNCERTAIN || "1").trim() === "1";

  if (!positiveSignals && !assumeAvailableWhenUncertain) {
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
    message: "Inventory found.",
    url: targetUrl.toString(),
  });
}
