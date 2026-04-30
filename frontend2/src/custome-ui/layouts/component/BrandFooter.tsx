import { Button } from "@/shadcn/components/ui/button";
import { Card, CardContent, CardFooter } from '@/shadcn/components/ui/card';
import { Separator } from '@/shadcn/components/ui/separator';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronRight, Mail, MapPinnedIcon } from "lucide-react";
//import { type JSX } from 'react';

const BrandFooter = () => {
    const navigate = useNavigate();
    return (
        <div className="w-full bg-foreground text-background">
            <Card className="container px-2 mx-auto border-0 shadow-none rounded-none bg-foreground text-background">
                <CardContent className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-12 gap-6 md:gap-8 lg-gap-10 my-20">
                    {/* Column #1 */}
                    <div className="flex flex-col col-span-2 md:col-span-3 lg:col-span-8 space-y-4 items-start text-xs sm:text-sm">
                        <img src="/assets/images/Leasedrop_logo-white-cmyk.svg" alt="Leasedrop Logo" className="h-8 sm:h-10 drop-shadow-md opacity-100 dark:invert" />
                        <p>
                            Leasedrop makes it effortless to find and format the lease clauses you need. </p>
                        <Button className="bg-background text-foreground font-semibold cursor-pointer hover:bg-background"
                            onClick={() => navigate({ to: '/pricing', hash: 'pricing-cards' })}>
                            Get your free trial <ChevronRight />
                        </Button>
                        <Button size='icon' className="border border-gray-700 hover:bg-gray-600 rounded-full cursor-pointer transition-colors duration-200" 
                            onClick={() => window.open("https://www.linkedin.com/company/leasedrop/about/", '_blank')}>
                            <img className="w-4 h-4 dark:invert" src="/assets/svgs/be-icons/linkedin.svg" alt="linkedin icon" />
                        </Button>
                    </div>

                    {/* Column #2 */}
                    <div className="flex flex-col col-span-1 pr-8 items-start space-y-4 text-xs sm:text-sm ">
                        <h3 className="text-lg font-semibold">Company</h3>
                        <Link to="/" className="hover:underline" search={{ redirect: '/' }}>Home</Link>
                        <Link to='/product' hash='top' className="hover:underline">Product</Link>
                        <Link to='/pricing' hash='pricing-cards' className="hover:underline">Pricing</Link>
                    </div>
                    {/* Column #3 */}
                    <div className="flex flex-col col-span-3 md:col-span-2 lg:col-span-3 items-start space-y-4 text-xs sm:text-sm">
                        <h3 className="text-lg font-semibold">Contact Us</h3>
                        <div className="flex flex-row gap-2 items-start">
                            <MapPinnedIcon className="h-4 w-4 mt-1" />
                            <p className="text-start">Unit 1 Bramber Court, 2 Bramber Road, London W14 9PW </p>
                        </div>
                        <div className="flex flex-row gap-2 items-center">
                            <Mail className="h-4 w-4 mt-1" />
                            <span>info@leasedrop.ai</span>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col sm:px-20 md:flex-row md:justify-between text-sm font-medium border-t border-gray-800 whitespace-nowrap">
                    <p>All rights reserved | Leasedrop 2024</p>
                    <div className="flex gap-4 h-5 items-center justify-center">
                        <Link to='/legal/privacy-policy' hash='top' className="hover:underline">Privacy Policy</Link>
                        <Separator orientation="vertical" className="p-0 bg-muted-foreground" />
                        <Link to='/legal/terms-and-conditions' hash='top' className="hover:underline">Terms and Conditions</Link>
                    </div>

                </CardFooter>
            </Card>
        </div>
    );
};

export default BrandFooter;
