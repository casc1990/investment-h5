export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // iOS Chrome 测试端点
  if (url.pathname === '/api/test') {
    return new Response(JSON.stringify({
      success: true,
      message: 'Proxy works!',
      timestamp: Date.now()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  
  // Proxy /api/* requests to the backend API
  if (url.pathname.startsWith('/api/')) {
    const backendUrl = 'https://investment-api.962549206.workers.dev' + url.pathname + (url.search || '');
    
    try {
      const response = await fetch(backendUrl, {
        method: context.request.method,
        headers: {
          ...Object.fromEntries(context.request.headers),
          'Host': 'investment-api.962549206.workers.dev',
        },
        body: context.request.body,
      });
      
      // Read the full response body to avoid streaming issues on iOS
      const bodyBuffer = await response.arrayBuffer();
      const bodyText = new TextDecoder().decode(bodyBuffer);
      
      return new Response(bodyText, {
        status: response.status,
        headers: {
          ...Object.fromEntries(response.headers),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ code: 500, message: 'Proxy error: ' + error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
    }
  }
  
  // For all other requests, serve the static files
  return context.next();
}
