import { AuthContext } from '@/config/auth/hooks/useAuth'
import BannerDisplayPage from '@/view/pages/BannerDisplayPage'
import AppErrorComponent from '@/view/pages/error/AppErrorComponent'
import { Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Activity, Suspense, useContext, useState } from 'react'
import AppFooter from './component/AppFooter'
import AppHeader from './component/AppHeader'
import WarningSmallScreen from '@/view/pages/WarningSM'
// import SideNav from './SideNavBK'

const AppLayout = () => {
    const authContext = useContext(AuthContext)
    const [, setSidebarOpen] = useState(false)

    return (
        <Suspense fallback={<AppErrorComponent />}>
            <div className='relative flex flex-col bg-accent overflow-hidden h-screen'>
                <AppHeader toggleSidebar={() => setSidebarOpen((prev) => !prev)} className="container mx-auto" />
                <main className='flex flex-1 container mx-auto px-4 w-full '>
                    <WarningSmallScreen />
                    <section className='p-6'>
                        <BannerDisplayPage darkState={() => undefined} />
                        <Outlet />
                    </section>
                </main>
                <Activity mode={authContext?.isAuthenticated ? "hidden" : "visible"}>
                    <AppFooter />
                </Activity>
            </div>
            <TanStackRouterDevtools />
        </Suspense>
    )
}

export default AppLayout
