import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { authenticateWithAccessCode, ensureUserAccount, getUserAccessStatus } from "@/lib/user-access";

const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
const resolvedAuthSecret =
  process.env.NEXTAUTH_SECRET ||
  process.env.AUTH_SECRET ||
  (process.env.NODE_ENV === "production" ? undefined : "shorts-maker-dev-auth-secret-change-me");
const providers: NextAuthOptions["providers"] = [];

if (googleClientId && googleClientSecret) {
  providers.push(
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret
    })
  );
}

providers.push(
  CredentialsProvider({
    id: "access-code",
    name: "접속 코드",
    credentials: {
      code: {
        label: "접속 코드",
        type: "text"
      }
    },
    async authorize(credentials) {
      const code = String(credentials?.code || "").trim();
      if (!code) {
        return null;
      }
      const user = await authenticateWithAccessCode(code);
      if (!user) {
        return null;
      }
      return {
        id: user.userId,
        name: user.name || "코드 사용자",
        email: user.email || undefined,
        accessCodeDisplay: code.toUpperCase()
      };
    }
  })
);

export const authOptions: NextAuthOptions = {
  providers,
  pages: {
    signIn: "/auth/signin"
  },
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user && "accessCodeDisplay" in user && typeof user.accessCodeDisplay === "string") {
        token.accessCodeDisplay = user.accessCodeDisplay;
      }
      return token;
    },
    async signIn({ user }) {
      const userId = String(user.id || user.email || "").trim();
      if (!userId) {
        return false;
      }

      try {
        await ensureUserAccount({
          userId,
          email: user.email || undefined,
          name: user.name || undefined
        });
        const access = await getUserAccessStatus({
          userId,
          email: user.email || undefined,
          name: user.name || undefined
        });
        if (!access.allowed) {
          return "/auth/blocked";
        }
      } catch {
        // If user table is not yet migrated, do not block signin.
      }

      return true;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id =
          (typeof token.sub === "string" && token.sub) ||
          (typeof token.email === "string" && token.email) ||
          undefined;
        session.user.accessCodeDisplay =
          typeof token.accessCodeDisplay === "string" ? token.accessCodeDisplay : undefined;
      }
      return session;
    }
  },
  secret: resolvedAuthSecret
};
