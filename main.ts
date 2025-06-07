const FAVICON_PATH = "./favicon.ico";
const CACHE_MAX_AGE = 5184000; // 24小时缓存（单位：秒）

// 预加载资源
const [homepage, favicon] = await Promise.all([
  Deno.readTextFile("./index.html").catch(() => null),
  Deno.readFile(FAVICON_PATH).catch(() => null),
]);

// 配置多个代理路径，包括主 CDN 路径
const PROXIES = [
  {
    prefix: "/imlazy/",
    target: "https://cdn.imlazy.ink:233/img/background/"
  },
  {
    prefix: "/image/",
    target: "https://cdn.statically.io/gh/FrecklyComb1728/image-cdn@master/image/"
  }
].sort((a, b) => b.prefix.length - a.prefix.length); // 按前缀长度降序排序

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // 统一缓存头配置
  const cacheHeaders = {
    "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
    "CDN-Cache-Control": `max-age=${CACHE_MAX_AGE}`,
  };

  // 处理图标请求
  if (url.pathname === "/favicon.ico") {
    return favicon 
      ? new Response(favicon, {
          headers: {
            ...cacheHeaders,
            "Content-Type": "image/x-icon",
          }
        })
      : new Response("Not Found", { status: 404 });
  }

  // 处理首页
  if (url.pathname === "/" || url.pathname === "") {
    return homepage 
      ? new Response(homepage, {
          headers: {
            ...cacheHeaders,
            "Content-Type": "text/html; charset=utf-8",
          }
        })
      : new Response("Service Unavailable", { status: 503 });
  }

  // 代理请求处理
  let targetBase = null;
  let basePath = url.pathname;

  // 查找匹配的代理配置
  for (const proxy of PROXIES) {
    if (url.pathname.startsWith(proxy.prefix)) {
      targetBase = proxy.target;
      basePath = url.pathname.slice(proxy.prefix.length);
      break;
    }
  }

  // 如果没有匹配的代理路径
  if (targetBase === null) {
    return new Response("Not Found", { status: 404 });
  }

  // 路径安全化处理
  const sanitizedPath = basePath
    .replace(/^\//, "") // 去除开头斜杠
    .replace(/\|/g, "") // 去除非法字符
    .replace(/\/+/g, "/"); // 合并连续斜杠

  const targetUrl = new URL(sanitizedPath + url.search, targetBase);

  // 处理 raw 参数（当 raw=true 时重定向到源链接）
  if (url.searchParams.get("raw") === "true") {
    return new Response(null, {
      status: 302,
      headers: {
        "Location": targetUrl.toString(),
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });
  }

  try {
    const headers = new Headers(req.headers);
    headers.delete("host");

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.body,
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Cache-Control", `public, max-age=${CACHE_MAX_AGE}`);
    responseHeaders.set("Content-Type", 
      `${responseHeaders.get("Content-Type") || "application/octet-stream"}; charset=utf-8`);

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    return new Response("Bad Gateway", {
      status: 502,
      headers: {
        ...cacheHeaders,
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
});

console.log(`
✅ 服务已启动（全资源缓存 ${CACHE_MAX_AGE} 秒）
├ 代理配置: ${PROXIES.map(p => `${p.prefix} → ${p.target}`).join(", ")}
└ 启动时间: ${new Date().toLocaleString()}
`);