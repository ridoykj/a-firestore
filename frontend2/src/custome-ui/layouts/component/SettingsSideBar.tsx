import { useAuth } from '@/config/auth/hooks/useAuth';
import BeIcons from '@/constant/BeIcons';
import { Avatar, AvatarFallback, AvatarImage } from '@/shadcn/components/ui/avatar';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/shadcn/components/ui/card';
import { Link } from '@tanstack/react-router';
import { Bell, CreditCard, Save, Settings, User, UserCog } from 'lucide-react';
import LogoutBtn from './LogoutBtn';
import { useUser } from '@/config/auth/hooks/useUser';

const items = [
    { id: 'profile', text: 'Personal Information', to: '/settings/profile', icon: <User className="w-5 h-5" />, },
    { id: 'documents', text: 'Your Dashboard', to: '/settings/documents', icon: <Save className="w-5 h-5" />, },
    { id: 'subscriptions', text: 'Payment', to: '/settings/subscriptions', icon: <CreditCard className="w-5 h-5" />, },
    { id: 'customers', text: 'Customer Management', to: '/settings/customers', icon: <UserCog className="w-5 h-5" />, },
    { id: 'banners', text: 'Home Page Banner', to: '/settings/banners', icon: <Bell className="w-5 h-5" />, },
    { id: 'clause-keywords', text: 'Train AI', to: '/settings/clause-keywords', icon: <div className='w-5 h-5'><BeIcons.Robot /></div>, },
    { id: 'clause-groups', text: 'Manage Groups', to: '/settings/clause-groups', icon: <Settings className="w-5 h-5" />, },
]

function SettingsSideBar() {
    const { profile } = useUser()
    const auth = useAuth();
    const admin = ['profile', 'documents', 'customers', 'banners', 'clause-keywords', 'clause-groups'];
    const customer = ['profile', 'documents', 'subscriptions'];
    return (
        <Card className="rounded-2xl mb-6 relative">
            <CardHeader>
                <CardTitle className='text-2xl'>
                    <div className='flex flex-col justify-center items-center p-4 *:data-[slot=avatar]:ring-foreground *:data-[slot=avatar]:ring-1'>
                        <Avatar className="w-20 h-20" >
                            <AvatarImage className='rounded-full object-cover'
                                // src={`${profile?.avatarUrl}&dt=${sessionStorage.getItem('last-profile-update')}`} alt="@shadcn" />
                                src={`${profile?.avatarUrl}`} alt="@shadcn" />
                            <AvatarFallback>{`${profile?.firstName?.substring(0, 1) || 'L'}${profile?.lastName?.substring(0, 1) || 'D'}`}</AvatarFallback>
                        </Avatar>
                        <div className='flex flex-col text-center '>
                            {/* <span className='font-semibold break-all text-center'>{`${auth?.user?.firstName} ${auth?.user?.lastName}`}</span> */}
                            <span className='font-semibold break-all text-center'>{`${profile?.firstName} ${profile?.lastName}`}</span>
                            <p className='text-base text-indigo-500 font-normal break-all text-center'>{profile?.email}</p>
                        </div>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent className='overflow-y-auto gap-1 flex flex-col h-full w-72'>
                {items.filter(it => auth.hasAnyRole(['ADMIN']) ? admin.includes(it.id) : customer.includes(it.id)).map((item) => (
                    <Link to={item.to} className="p-2 rounded-xl flex items-center gap-2 hover:bg-primary-foreground hover:text-secondary-foreground [&.active]:bg-indigo-50 [&.active]:text-indigo-500 [&.active]:font-semibold">
                        {item.icon}
                        <span>{item.text}</span>
                    </Link>
                ))}
            </CardContent>
            <CardFooter>
                <LogoutBtn />
            </CardFooter>
        </Card >
    )
}
export default SettingsSideBar