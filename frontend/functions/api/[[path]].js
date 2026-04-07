const DEFAULT_BACKEND_ORIGIN = 'https://expense-tracker-gt7o.onrender.com';

function getBackendOrigin(env) {
  return env?.BACKEND_ORIGIN || DEFAULT_BACKEND_ORIGIN;
}

function buildBackendUrl(requestUrl, backendOrigin) {
  const incomingUrl = new URL(requestUrl);
  const backendUrl = new URL(backendOrigin);

  backendUrl.pathname = incomingUrl.pathname.replace(/^\/api/, '') || '/';
  backendUrl.search = incomingUrl.search;

  return backendUrl.toString();
}

function copyRequestHeaders(request, backendOrigin) {
  const headers = new Headers(request.headers);
  headers.set('host', new URL(backendOrigin).host);
  headers.set('x-forwarded-host', new URL(request.url).host);
  headers.set('x-forwarded-proto', new URL(request.url).protocol.replace(':', ''));
  return headers;
}

function copyResponseHeaders(response, backendOrigin) {
  const headers = new Headers(response.headers);

  headers.delete('access-control-allow-origin');
  headers.delete('access-control-allow-credentials');
  headers.delete('vary');

  const location = headers.get('location');
  if (location && location.startsWith(backendOrigin)) {
    headers.set('location', location.replace(backendOrigin, '/api'));
  }

  return headers;
}

export async function onRequest(context) {
  const { request, env } = context;
  const backendOrigin = getBackendOrigin(env);
  const backendUrl = buildBackendUrl(request.url, backendOrigin);

  const init = {
    method: request.method,
    headers: copyRequestHeaders(request, backendOrigin),
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  const backendResponse = await fetch(backendUrl, init);

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers: copyResponseHeaders(backendResponse, backendOrigin),
  });
}
