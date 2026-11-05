import { NextResponse, type NextRequest } from "next/server";

/**
 * Barreira otimista: sem cookie de sessão, redireciona ao login.
 * A validação real (sessão no banco + permissões) é feita no servidor em src/lib/auth.ts.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("ljc_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/cliente/:path*"] };
