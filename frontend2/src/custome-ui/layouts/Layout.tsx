import { useState } from 'react'
import BrandFooter from './component/BrandFooter'
import AppHeader from './component/AppHeader'
import SideNav from './component/SideNav';
interface Layout {
    children: React.ReactNode;
    // Other props
}
const Layout = ({ children }: Layout) => {
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    return (
        <div className='flex flex-col h-screen bg-gray-100 overflow-hidden'>
            <AppHeader toggleSidebar={() => setSidebarOpen(!isSidebarOpen)} />
            <main className='flex flex-1 overflow-hidden'>
                {/* SideNav: Hidden on small screens, visible from medium screens up */}
                {/* <SideNav isSidebarOpen={isSidebarOpen} /> */}
                <SideNav />
                {/* Main content area */}
                <section className='flex-1 p-6 overflow-y-auto'>
                    {children}
                </section>
            </main>
            <BrandFooter />
        </div>
    )
}

export default Layout