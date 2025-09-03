// Cloudflare Worker for routing probelabs.com/memaris/* to Memaris Pages site
// Also handles 301 redirects from old mnemaris URLs for backward compatibility
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle backward compatibility: redirect mnemaris -> memaris (301 permanent redirect)
    if (url.hostname === 'probelabs.com' && url.pathname.startsWith('/mnemaris')) {
      const newPath = url.pathname.replace('/mnemaris', '/memaris');
      return Response.redirect(url.origin + newPath + url.search, 301);
    }
    
    // Check if this is a request to probelabs.com/memaris or /memaris/*
    if (url.hostname === 'probelabs.com' && url.pathname.startsWith('/memaris')) {
      // Handle /memaris without trailing slash by redirecting to /memaris/
      if (url.pathname === '/memaris') {
        return Response.redirect(url.origin + '/memaris/', 301);
      }
      
      // Remove /memaris from the path and proxy to the Pages site
      const newPath = url.pathname.replace('/memaris', '') || '/';
      const pagesUrl = `https://probelabs-site.pages.dev${newPath}${url.search}`;
      
      // Fetch from the Pages deployment
      const response = await fetch(pagesUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      
      // Create new response with same content but updated headers
      const newResponse = new Response(response.body, response);
      
      // Update any absolute links in HTML content to include /memaris prefix
      if (response.headers.get('content-type')?.includes('text/html')) {
        const html = await response.text();
        const updatedHtml = html
          .replace(/href="\//g, 'href="/memaris/')
          .replace(/src="\//g, 'src="/memaris/')
          .replace(/url\(\//g, 'url(/memaris/');
        return new Response(updatedHtml, {
          status: response.status,
          headers: response.headers
        });
      }
      
      return newResponse;
    }
    
    // For any other requests, pass through
    return fetch(request);
  },
};