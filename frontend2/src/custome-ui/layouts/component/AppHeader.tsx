import { useAuth } from '@/config/auth/hooks/useAuth';
import BeIcons from '@/constant/BeIcons';
import { Button } from '@/shadcn/components/ui/button';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger
} from "@/shadcn/components/ui/navigation-menu";
import { cn } from '@/shadcn/lib/utils';
// import { Avatar, AvatarFallback, AvatarImage } from '@radix-ui/react-avatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/shadcn/components/ui/avatar';
import { Link, useLocation } from "@tanstack/react-router";
import { Bell, Expand, Minimize, Save, Settings, User, UserCog } from 'lucide-react';
import { Activity, useState } from 'react';
import screenfull from 'screenfull';
import LogoutBtn from './LogoutBtn';
import SideNavDrawer from './SideNav';
import { useUser } from '@/config/auth/hooks/useUser';

// const profileRoutesAdmin = [
//   { path: '/profile/personal-info', label: 'Personal Information', icon: svgIcons.small_user },
//   { path: '/profile/saved-file', label: 'Your Dashboard', icon: svgIcons.small_folder },
//   { path: "/profile/customer-management", label: "Customer Management", icon: svgIcons.customerManagementInactive },
//   { path: '/profile/home-page-banner', label: 'Home Page Banner', icon: svgIcons.small_bell },
//   { path: '/profile/train-ai', label: 'Train AI', icon: svgIcons.robot },
//   { path: '/profile/manage-groups', label: 'Manage Groups', icon: svgIcons.settings },
//   { path: '/profile/logout', label: 'Log Out', icon: svgIcons.small_logout },
// ];

// const profileRoutesCustomer = [
//   { path: '/profile/personal-info', label: 'Personal Information', icon: svgIcons.small_user },
//   { path: '/profile/saved-file', label: 'Your Dashboard', icon: svgIcons.small_folder },
//   { path: '/profile/payment', label: 'Payment', icon: svgIcons.small_creditCard },
//   { path: '/profile/logout', label: 'Log Out', icon: svgIcons.small_logout },
// ];

const activeLink = {
  active: 'hover:bg-primary hover:text-secondary [&.active]:bg-primary [&.active]:text-secondary [&.active]:font-semibold mx-2',
  profileMenu: 'flex-row items-center gap-2 text-nowrap'
}
interface AppHeaderProps {
  isDarkBg?: boolean,
  toggleSidebar: () => void;
  className?: string;
}
const AppHeader = ({
  isDarkBg,
  className,
}: AppHeaderProps) => {
  const location = useLocation();
  // const auth = useContext(AuthContext);

  const { profile } = useUser()
  const auth = useAuth();
  const [isFullScreen, setIsFullScreen] = useState(false);
  const toggleFullScreen = () => {
    if (screenfull.isEnabled) {
      if (screenfull.isFullscreen) {
        screenfull.exit();
        setIsFullScreen(false);
      } else {
        screenfull.request();
        setIsFullScreen(true);
      }
    }
  };

  return (
    <>
      <header className={cn("flex justify-between items-center sticky top-0 z-50 w-full p-3 gap-3", className)}>
        <Link to="/">
          <img
            src={isDarkBg && location.pathname === '/'
              ? "/assets/images/Leasedrop_logo-white-cmyk.svg"
              : "/assets/images/Leasedrop_logo-black-cmyk.svg"
            }
            alt="Leasedrop Logo"
            // className="h-8 sm:h-10 drop-shadow-lg mix-blend-difference opacity-80"
            className={cn(
              "h-8 sm:h-8 drop-shadow-md opacity-100 mix-blend-difference",
              location.pathname !== "/" && "dark:invert"
            )}
          />
        </Link>
        {/* Placeholder for other header items like search or user profile */}
        <div className="grow flex gap-10 justify-end">
          {/* <NavigationMenuDemo/> */}
          <NavigationMenu viewport={false} className='hidden md:block bg-background text-foreground rounded-2xl py-2 z-20 px-4 flex-row'>
            <NavigationMenuList className="flex flex-wrap divide-x divide-gray-300 " defaultValue={'home'}>
              <NavigationMenuItem value='home'>
                <NavigationMenuLink asChild className={activeLink.active}><Link to="/">Home</Link></NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={activeLink.active}><Link to="/pricing" hash="top">Pricing</Link></NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={activeLink.active}><Link to="/product" hash="top">Product</Link></NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={activeLink.active}><Link to="/blog">Blog</Link></NavigationMenuLink>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuTrigger className='font-normal [&>svg]:hidden'>Legal</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid left-20 gap-4 w-48">
                    <li>
                      <NavigationMenuLink asChild className={activeLink.active}><Link to="/legal/terms-and-conditions" hash="top">Terms and Condition</Link></NavigationMenuLink>
                      <NavigationMenuLink asChild className={activeLink.active}><Link to="/legal/privacy-policy" hash="top">Privacy Policy</Link></NavigationMenuLink>
                      <NavigationMenuLink asChild className={activeLink.active}><Link to="/legal/service-level-terms" hash="top">Service Level Terms</Link></NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>

            </NavigationMenuList>
          </NavigationMenu>
          <div className='inline-flex gap-4 z-50 justify-center items-center'>
            <Activity mode={auth?.isAuthenticated ? "visible" : "hidden"}>
              <NavigationMenu viewport={false} className='w-screen flex '>
                <NavigationMenuList className="flex-wrap hidden lg:block">
                  <NavigationMenuItem className=''>
                    {/* <NavigationMenuTrigger style={{ backgroundImage: auth?.user?.avatarUrl ? `url('${auth?.user?.avatarUrl}&df=${sessionStorage.getItem('last-profile-update')}')` : `url('/assets/app/ld.svg')` }} className={`[&>svg]:hidden bg-cover ring-1 ring-gray-400 bg-gray-300 bg-center w-10 h-10 text-black text-4xl`}>
                      {auth?.user?.avatarUrl !== undefined || auth?.user?.avatarUrl !== null ? "" : (<span className='text-black'>LD</span>)}
                    </NavigationMenuTrigger> */}
                    {/* <NavigationMenuTrigger  className={`[&>svg]:hidden bg-cover ring-1 ring-gray-400 bg-gray-300 bg-center w-10 h-10 text-black text-4xl`}>
                      {auth?.user?.avatarUrl !== undefined || auth?.user?.avatarUrl !== null ? (<span className='text-black'>{`${auth?.user?.firstName?.substring(0, 1) || 'L'}${auth?.user?.lastName?.substring(0, 1) || 'D'}`}</span>) : ""}
                      
                    </NavigationMenuTrigger> */}
                    <NavigationMenuTrigger style={profile && profile.avatarUrl !== undefined || profile?.avatarUrl !== null ? { backgroundImage: `url('${profile?.avatarUrl}&df=${sessionStorage.getItem('last-profile-update') ?? '12345'}')` } : {}} className={`[&>svg]:hidden bg-cover ring-1 ring-gray-400 bg-gray-300 bg-center w-10 h-10 text-black text-4xl`}>
                      {profile && profile.avatarUrl === undefined || profile?.avatarUrl === null ? (<span className='text-black text-base'>{`${profile.firstName?.substring(0, 1) || 'L'}${profile.lastName?.substring(0, 1) || 'D'}`}</span>) : ""}
                      {/* <span className='text-black'>LD</span> */}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent className='-left-36 3xl:left-0 top-0' >
                      <ul className="w-56">
                        <li>
                          <NavigationMenuLink asChild>
                            <Link className='flex flex-row w-full border-b *:data-[slot=avatar]:ring-foreground *:data-[slot=avatar]:ring-1' to="/settings/profile">
                              <Avatar className="w-10 h-10">
                                <AvatarImage className='rounded-full object-cover' src={`${profile?.avatarUrl}&dt=${sessionStorage.getItem('last-profile-update')}`} alt="@shadcn" />
                                {/* <AvatarFallback>LD</AvatarFallback> */}
                                {/* <AvatarFallback><span  className='text-xs font-normal'>{`${profile?.firstName?.substring(0, 1) || 'LD'}${profile?.lastName?.substring(0, 1) || ''}`}</span></AvatarFallback> */}
                                <AvatarFallback>{`${profile?.firstName?.substring(0, 1) || 'LD'}${profile?.lastName?.substring(0, 1) || ''}`}</AvatarFallback>
                              </Avatar>
                              {/* <div className='flex flex-col ml-2'>
                                <span className='font-semibold truncate'>{`${auth?.user?.firstName} ${auth?.user?.lastName}`}</span>
                                <p className='text-wrap font-extralight text-xs'>{auth?.user?.email}</p>
                              </div> */}
                              <div className='flex flex-col ml-2'>
                                <span className='font-semibold break-all'>{`${profile?.firstName} ${profile?.lastName}`}</span>
                                <p className='font-extralight text-xs break-all text-center'>{profile?.email}</p>
                              </div>
                            </Link>
                          </NavigationMenuLink>
                          <NavigationMenuLink asChild className={activeLink.active}><Link to="/settings/profile" className={activeLink.profileMenu}><User />Personal Information</Link></NavigationMenuLink>
                          <NavigationMenuLink asChild className={activeLink.active}><Link to="/settings/documents" className={activeLink.profileMenu}><Save />Your Dashboard</Link></NavigationMenuLink>
                          <Activity mode={auth.hasAnyRole(['CUSTOMER']) ? "visible" : "hidden"}>
                            <NavigationMenuLink asChild className={activeLink.active}><Link to="/settings/subscriptions" className={activeLink.profileMenu}><Save />Payment</Link></NavigationMenuLink>
                          </Activity>
                          <Activity mode={auth.hasAnyRole(['CUSTOMER']) ? "hidden" : "visible"}>
                            <NavigationMenuLink asChild className={activeLink.active}><Link to="/settings/customers" className={activeLink.profileMenu}><UserCog />Customer Management</Link></NavigationMenuLink>
                            <NavigationMenuLink asChild className={activeLink.active}><Link to="/settings/banners" className={activeLink.profileMenu}><Bell />Home Page Banner</Link></NavigationMenuLink>
                            <NavigationMenuLink asChild className={activeLink.active}><Link to="/settings/clause-keywords" className={activeLink.profileMenu}><BeIcons.Robot />Train AI</Link></NavigationMenuLink>
                            <NavigationMenuLink asChild className={activeLink.active}><Link to="/settings/clause-groups" className={activeLink.profileMenu}><Settings />Manage Groups</Link></NavigationMenuLink>
                          </Activity>
                          <NavigationMenuLink asChild className={activeLink.active}>
                            {/* <Button
                              variant='ghost' className={`w-full font-normal justify-start ${activeLink.profileMenu}`} size='icon-sm'
                              onClick={authContext?.logout}
                            >
                              <Eye /> Log Out
                            </Button> */}
                            <LogoutBtn />
                          </NavigationMenuLink>
                        </li>
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                </NavigationMenuList>
              </NavigationMenu>
            </Activity>
            <Button onClick={toggleFullScreen} size="lg" variant="secondary" className='hidden lg:block cursor-pointer bg-white' title={isFullScreen ? "Exit Full Screen" : "Full Screen"} >
              {isFullScreen ? <Minimize className="w-5 h-5" /> : <Expand className="w-5 h-5" />}
            </Button>
            {/* <ThemeModeToggle /> */}
            {/* <Button className='cursor-pointer' size="lg" onClick={toggleSidebar} aria-label="Toggle navigation">
            <Menu /> 
            </Button> */}
            <SideNavDrawer />
          </div>
        </div>
      </header>
    </>
  );
};

export default AppHeader;
