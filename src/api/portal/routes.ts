/**
 * App Portal Routes
 *
 * Handles server-side rendered pages for app users.
 */

import { Hono } from "hono";
import { html } from "hono/html";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { db } from "@z0/utils/db/client";
import { LoginPage } from "./views/login";
import { RegisterPage } from "./views/register";
import { DashboardPage } from "./views/dashboard";
import { ProfilePage } from "./views/profile";
import { ErrorPage } from "./views/error";
import {
  validateAppUserCredentials,
  createAppUserSession,
  getAppUserFromSession,
  hashPassword,
} from "./auth";

const appRoutes = new Hono<{
  Variables: {
    app: {
      id: string;
      name: string;
      slug: string;
      organizationId: string;
      allowPublicRegistration: boolean;
      loginPageConfig: {
        logo?: string;
        primaryColor?: string;
        welcomeText?: string;
        customCss?: string;
      } | null;
      enabledAuthMethods: string[];
    };
  };
}>();

/**
 * Middleware: Load app by slug
 */
appRoutes.use("*", async (c, next) => {
  const appSlug = c.req.param("appSlug");

  const app = await db.app.findFirst({
    where: { slug: appSlug, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      slug: true,
      organizationId: true,
      allowPublicRegistration: true,
      loginPageConfig: true,
      enabledAuthMethods: true,
    },
  });

  if (!app) {
    return c.html(
      ErrorPage({
        title: "App Not Found",
        message: "The application you're looking for doesn't exist or is not active.",
      }),
      404
    );
  }

  c.set("app", app as any);
  await next();
});

/**
 * GET /login - Render login page
 */
appRoutes.get("/login", async (c) => {
  const app = c.get("app");

  // Check if already logged in
  const sessionToken = getCookie(c, `app_session_${app.slug}`);
  if (sessionToken) {
    const user = await getAppUserFromSession(sessionToken, app.id);
    if (user) {
      return c.redirect(`/api/portal/${app.slug}/dashboard`);
    }
  }

  return c.html(
    LoginPage({
      app: {
        name: app.name,
        logo: app.loginPageConfig?.logo,
        primaryColor: app.loginPageConfig?.primaryColor,
        welcomeText: app.loginPageConfig?.welcomeText,
      },
      appSlug: app.slug,
      allowRegistration: app.allowPublicRegistration,
    })
  );
});

/**
 * POST /login - Handle login form submission
 */
appRoutes.post("/login", async (c) => {
  const app = c.get("app");
  const body = await c.req.parseBody();
  const email = body.email as string;
  const password = body.password as string;

  if (!email || !password) {
    return c.html(
      LoginPage({
        app: {
          name: app.name,
          logo: app.loginPageConfig?.logo,
          primaryColor: app.loginPageConfig?.primaryColor,
          welcomeText: app.loginPageConfig?.welcomeText,
        },
        appSlug: app.slug,
        allowRegistration: app.allowPublicRegistration,
        error: "Email and password are required.",
      }),
      400
    );
  }

  const result = await validateAppUserCredentials(app.id, email, password);

  if (!result.success || !result.user) {
    return c.html(
      LoginPage({
        app: {
          name: app.name,
          logo: app.loginPageConfig?.logo,
          primaryColor: app.loginPageConfig?.primaryColor,
          welcomeText: app.loginPageConfig?.welcomeText,
        },
        appSlug: app.slug,
        allowRegistration: app.allowPublicRegistration,
        error: result.error || "Invalid email or password.",
      }),
      401
    );
  }

  // Create session
  const session = await createAppUserSession(result.user.id, app.id, {
    userAgent: c.req.header("user-agent"),
    ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip"),
  });

  // Set session cookie
  setCookie(c, `app_session_${app.slug}`, session.token, {
    path: `/api/portal/${app.slug}`,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return c.redirect(`/api/portal/${app.slug}/dashboard`);
});

/**
 * GET /register - Render registration page
 */
appRoutes.get("/register", async (c) => {
  const app = c.get("app");

  if (!app.allowPublicRegistration) {
    return c.html(
      ErrorPage({
        title: "Registration Disabled",
        message: "Public registration is not enabled for this application.",
      }),
      403
    );
  }

  return c.html(
    RegisterPage({
      app: {
        name: app.name,
        logo: app.loginPageConfig?.logo,
        primaryColor: app.loginPageConfig?.primaryColor,
      },
      appSlug: app.slug,
    })
  );
});

/**
 * POST /register - Handle registration form submission
 */
appRoutes.post("/register", async (c) => {
  const app = c.get("app");

  if (!app.allowPublicRegistration) {
    return c.html(
      ErrorPage({
        title: "Registration Disabled",
        message: "Public registration is not enabled for this application.",
      }),
      403
    );
  }

  const body = await c.req.parseBody();
  const email = body.email as string;
  const password = body.password as string;
  const name = body.name as string;

  if (!email || !password || !name) {
    return c.html(
      RegisterPage({
        app: {
          name: app.name,
          logo: app.loginPageConfig?.logo,
          primaryColor: app.loginPageConfig?.primaryColor,
        },
        appSlug: app.slug,
        error: "All fields are required.",
      }),
      400
    );
  }

  // Check if user already exists
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    // Check if they're already a member of this app
    const existingMembership = await db.appMembership.findUnique({
      where: { userId_appId: { userId: existingUser.id, appId: app.id } },
    });

    if (existingMembership) {
      return c.html(
        RegisterPage({
          app: {
            name: app.name,
            logo: app.loginPageConfig?.logo,
            primaryColor: app.loginPageConfig?.primaryColor,
          },
          appSlug: app.slug,
          error: "An account with this email already exists. Please log in.",
        }),
        400
      );
    }

    // Add them as app member
    await db.appMembership.create({
      data: {
        userId: existingUser.id,
        appId: app.id,
        roleType: "APP_USER",
        isActive: true,
      },
    });

    return c.redirect(`/api/portal/${app.slug}/login?registered=true`);
  }

  // Create new user and app membership
  const hashedPassword = await hashPassword(password);

  await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        status: "ACTIVE",
        emailVerified: false,
      },
    });

    await tx.appMembership.create({
      data: {
        userId: user.id,
        appId: app.id,
        roleType: "APP_USER",
        isActive: true,
      },
    });
  });

  return c.redirect(`/api/portal/${app.slug}/login?registered=true`);
});

/**
 * Middleware: Require authentication for protected routes
 */
const requireAuth = async (c: any, next: any) => {
  const app = c.get("app");
  const sessionToken = getCookie(c, `app_session_${app.slug}`);

  if (!sessionToken) {
    return c.redirect(`/api/portal/${app.slug}/login`);
  }

  const user = await getAppUserFromSession(sessionToken, app.id);
  if (!user) {
    deleteCookie(c, `app_session_${app.slug}`, { path: `/api/portal/${app.slug}` });
    return c.redirect(`/api/portal/${app.slug}/login`);
  }

  c.set("user", user);
  await next();
};

/**
 * GET /dashboard - Render app user dashboard
 */
appRoutes.get("/dashboard", requireAuth, async (c) => {
  const app = c.get("app");
  const user = c.get("user") as any;

  return c.html(
    DashboardPage({
      app: {
        name: app.name,
        logo: app.loginPageConfig?.logo,
        primaryColor: app.loginPageConfig?.primaryColor,
      },
      appSlug: app.slug,
      user: {
        name: user.name,
        email: user.email,
      },
    })
  );
});

/**
 * GET /profile - Render profile page
 */
appRoutes.get("/profile", requireAuth, async (c) => {
  const app = c.get("app");
  const user = c.get("user") as any;

  return c.html(
    ProfilePage({
      app: {
        name: app.name,
        logo: app.loginPageConfig?.logo,
        primaryColor: app.loginPageConfig?.primaryColor,
      },
      appSlug: app.slug,
      user: {
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
    })
  );
});

/**
 * POST /logout - Handle logout
 */
appRoutes.post("/logout", async (c) => {
  const app = c.get("app");
  const sessionToken = getCookie(c, `app_session_${app.slug}`);

  if (sessionToken) {
    // Revoke session in database
    await db.session.updateMany({
      where: { token: sessionToken },
      data: { status: "REVOKED" },
    });
  }

  deleteCookie(c, `app_session_${app.slug}`, { path: `/api/portal/${app.slug}` });
  return c.redirect(`/api/portal/${app.slug}/login`);
});

export default appRoutes;
