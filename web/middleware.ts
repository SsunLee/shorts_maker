import { withAuth } from "next-auth/middleware";

const resolvedAuthSecret =
  process.env.NEXTAUTH_SECRET ||
  process.env.AUTH_SECRET ||
  (process.env.NODE_ENV === "production" ? undefined : "shorts-maker-dev-auth-secret-change-me");

export default withAuth({
  secret: resolvedAuthSecret,
  pages: {
    signIn: "/auth/signin"
  }
});

export const config = {
  matcher: [
    "/",
    "/create/:path*",
    "/dashboard/:path*",
    "/templates/:path*",
    "/ideas/:path*",
    "/longform-to-shorts/:path*",
    "/settings/:path*"
  ]
};
