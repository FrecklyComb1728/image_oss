const TARGET_BASE = "https://testingcf.jsdelivr.net/gh/FrecklyComb1728/picx-images-hosting@master/";
const FAVICON_PATH = "./favicon.ico";
const CACHE_MAX_AGE = 86400; // 24小时缓存（单位：秒）

// 预加载资源
const [homepage, favicon] = await Promise.all([
  Deno.readTextFile("./index.html").catch(() => null),
  Deno.readFile(FAVICON_PATH).catch(() => null),
]);

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
  try {
    const sanitizedPath = url.pathname
      .replace(/^\//, "")
      .replace(/\|/g, "")
      .replace(/\/+/g, "/");
    
    const targetUrl = new URL(sanitizedPath + url.search, TARGET_BASE);
    
    // 转发请求
    const headers = new Headers(req.headers);
    headers.delete("host");
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.body,
    });

    // 处理所有响应头
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
├ 目标地址: ${TARGET_BASE}
└ 启动时间: ${new Date().toLocaleString()}
`);