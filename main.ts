const FAVICON_PATH = "./favicon.ico";
const CACHE_MAX_AGE = 5184000; // 24小时缓存（单位：秒）

// 预加载资源
const [homepage, favicon] = await Promise.all([
  Deno.readTextFile("./index.html").catch(() => null),
  Deno.readFile(FAVICON_PATH).catch(() => null),
]);

// 配置多个代理路径，带有冗余措施
const PROXIES = [
  {
    prefix: "/imlazy/",
    target: "https://cdn.imlazy.ink:233/img/background/",
    // 自定义重定向模板（可选）
    rawRedirect: "https://custom-source-domain.com/images/{path}"
  },
  {
    prefix: "/image/",
    target: "https://cdn.statically.io/gh/FrecklyComb1728/image-cdn@master/image/",
    // 没有配置自定义重定向模板（冗余措施会处理）
  }
].sort((a, b) => b.prefix.length - a.prefix.length);

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
  let proxyConfig = null;
  let basePath = url.pathname;

  // 查找匹配的代理配置
  for (const proxy of PROXIES) {
    if (url.pathname.startsWith(proxy.prefix)) {
      proxyConfig = proxy;
      basePath = url.pathname.slice(proxy.prefix.length);
      break;
    }
  }

  if (!proxyConfig) {
    return new Response("Not Found", { status: 404 });
  }

  // 路径安全化处理
  const sanitizedPath = basePath
    .replace(/^\//, "") // 去除开头斜杠
    .replace(/\|/g, "") // 去除非法字符
    .replace(/\/+/g, "/"); // 合并连续斜杠

  const targetUrl = new URL(sanitizedPath, proxyConfig.target);

  // 处理 raw 参数（当 raw=true 时重定向到源链接）
  if (url.searchParams.get("raw") === "true") {
    let redirectUrl;
    
    // 1. 检查是否配置了自定义重定向模板
    if (proxyConfig.rawRedirect) {
      // 使用自定义模板构建重定向URL ({path}占位符会被替换)
      redirectUrl = proxyConfig.rawRedirect.replace("{path}", sanitizedPath);
    } 
    // 2. 冗余措施：没有自定义模板时自动生成基础重定向URL
    else {
      // 使用默认目标URL作为基础
      redirectUrl = targetUrl.toString();
    }
    
    // 添加查询参数（排除raw参数）
    const params = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      if (key !== "raw") params.append(key, value);
    });
    
    if (params.toString()) {
      redirectUrl += (redirectUrl.includes('?') ? '&' : '?') + params.toString();
    }
    
    return new Response(null, {
      status: 302,
      headers: {
        "Location": redirectUrl,
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });
  }

  try {
    const headers = new Headers(req.headers);
    headers.delete("host");

    // 添加所有查询参数到目标 URL
    url.searchParams.forEach((value, key) => {
      targetUrl.searchParams.append(key, value);
    });

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.body,
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Cache-Control", `public, max-age=${CACHE_MAX_AGE}`);
    
    // 确保响应包含正确的内容类型
    const contentType = responseHeaders.get("Content-Type") || "application/octet-stream";
    responseHeaders.set("Content-Type", `${contentType.includes(';') ? contentType : contentType + '; charset=utf-8'}`);

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
├ 代理配置:
${PROXIES.map(p => `│   ${p.prefix} → ${p.target}\n│      重定向模板: ${p.rawRedirect || "自动生成"}`).join("\n")}
└ 启动时间: ${new Date().toLocaleString()}
`);