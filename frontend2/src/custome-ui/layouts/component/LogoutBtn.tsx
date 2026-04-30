import { AuthContext } from '@/config/auth/hooks/useAuth';
import { Button } from '@/shadcn/components/ui/button';
import { useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { useContext, useEffect } from 'react';

function LogoutBtn() {
    const navigate = useNavigate();
    const authContext = useContext(AuthContext);

    useEffect(() => {
        if (!authContext?.isAuthenticated) {
            // navigate({ to: '/signin', search: { redirect: '/' } })
            // navigate({ to: '/signin', search: { redirect: '/' } })
            // window.location.href = '/signin'
        }
    }, [authContext?.isAuthenticated, navigate])

    return (
        <div className='w-full px-2'>
            <Button
                variant='ghost'
                // variant='ghost' className={`w-full font-normal justify-center items-center cursor-pointer hover:bg-primary hover:text-secondary [&.active]:bg-primary [&.active]:text-secondary [&.active]:font-semibold mx-2`} size='icon-sm'
                // className={`w-full font-normal items-center cursor-pointer justify-start`}
                className={`w-full font-normal items-center cursor-pointer justify-start hover:bg-primary hover:text-secondary dark:hover:bg-primary dark:hover:text-secondary dark:hover:font-semibold`}
                onClick={authContext?.logout}
            >
                <LogOut />Log Out
            </Button>
        </div>
    )
}

export default LogoutBtn