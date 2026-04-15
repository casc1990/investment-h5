export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // Proxy /api/* requests to the backend API
  if (url.pathname.startsWith('/api/')) {
    const backendUrl = 'https://investment-api.962549206.workers.dev' + url.pathname + (url.search || '');
    const response = await fetch(backendUrl, {
      headers: {
        ...Object.fromEntries(context.request.headers),
        'Host': 'investment-api.962549206.workers.dev',
      },
    });
    
    // Return response with cache bypass headers
    return new Response(response.body, {
      ...response,
      headers: {
        ...Object.fromEntries(response.headers),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  }
  
  // For all other requests, serve the static files
  return context.next();
}
