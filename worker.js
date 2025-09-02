// Cloudflare Worker for routing probelabs.com/mnemaris/* to Mnemaris Pages site
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Check if this is a request to probelabs.com/mnemaris or /mnemaris/*
    if (url.hostname === 'probelabs.com' && url.pathname.startsWith('/mnemaris')) {
      // Handle /mnemaris without trailing slash by redirecting to /mnemaris/
      if (url.pathname === '/mnemaris') {
        return Response.redirect(url.origin + '/mnemaris/', 301);
      }
      
      // Remove /mnemaris from the path and proxy to the Pages site
      const newPath = url.pathname.replace('/mnemaris', '') || '/';
      const pagesUrl = `https://probelabs-site.pages.dev${newPath}${url.search}`;
      
      // Fetch from the Pages deployment
      const response = await fetch(pagesUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      
      // Create new response with same content but updated headers
      const newResponse = new Response(response.body, response);
      
      // Update any absolute links in HTML content to include /mnemaris prefix
      if (response.headers.get('content-type')?.includes('text/html')) {
        const html = await response.text();
        const updatedHtml = html
          .replace(/href="\//g, 'href="/mnemaris/')
          .replace(/src="\//g, 'src="/mnemaris/')
          .replace(/url\(\//g, 'url(/mnemaris/');
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