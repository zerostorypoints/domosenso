export function markdownResponse(body:string):Response{return new Response(body,{headers:{'Content-Type':'text/markdown; charset=utf-8'}});}
