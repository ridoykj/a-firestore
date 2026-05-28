import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { GcpStoreProvider } from "@/store/gcp-store"
import { ThemeProvider } from "@/shadcn/components/theme-provider"
import './style.css'
import { TooltipProvider } from './shadcn/components/ui/tooltip'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // retry: 1,
      // refetchOnWindowFocus: false,
      // staleTime: 5 * 60 * 1000, // 5 minutes
      // staleTime: 5000, // 5 seconds 
    },
  },
})

// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <GcpStoreProvider>
          <TooltipProvider>
            <RouterProvider router={router} />
          </TooltipProvider>
          {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
        </GcpStoreProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
