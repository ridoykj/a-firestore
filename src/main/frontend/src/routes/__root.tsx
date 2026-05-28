import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Suspense } from "react";
import { Toaster } from "../shadcn/components/ui/sonner";
import AppErrorComponent from "../view/pages/error/AppErrorComponent";
import GlobalErrorComponent from "../view/pages/error/GlobalErrorComponent";
import NotFoundPage from "../view/pages/error/NotFoundPage";

// export const Route = createRootRouteWithContext<AuthRouterContext>()({
export const Route = createRootRoute({
    head: () => ({
        meta: [
            {
                name: 'description',
                content: 'My App is a web application',
            },
            {
                title: 'NPS',
            },
        ],
        links: [
            {
                rel: 'icon',
                href: '/favicon.svg',
            },
        ],
        scripts: [
            {
                src: 'https://www.google-analytics.com/analytics.js',
            },
        ],
    }),
    scripts: () => [
        {
            children: 'console.log("body script initialized")',
        },
    ],
    component: () => (
        <>
            {/* Main Navigation */}
            <HeadContent />
            <Suspense fallback={<AppErrorComponent />}>
                <Outlet />
                <Toaster richColors />
                {import.meta.env.DEV ? <TanStackRouterDevtools /> : null}
            </Suspense>
            <Scripts />
        </>
    ),
    notFoundComponent: NotFoundPage,
    errorComponent: ({ error }) => <GlobalErrorComponent props={error} />
});
