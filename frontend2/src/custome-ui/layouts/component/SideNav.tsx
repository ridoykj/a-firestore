"use client";

import { Button } from "@/shadcn/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTrigger,
} from "@/shadcn/components/ui/drawer";

// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuTrigger,
// } from "@/shadcn/components/ui/dropdown-menu";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shadcn/components/ui/accordion";

import { useAuth } from '@/config/auth/hooks/useAuth';
import { useUser } from "@/config/auth/hooks/useUser";
import { Avatar, AvatarFallback, AvatarImage } from '@radix-ui/react-avatar';
import { Link } from "@tanstack/react-router";
import { ChevronRight, Menu } from "lucide-react";
import { Activity } from 'react';
import LogoutBtn from "./LogoutBtn";


export default function SideNavDrawer() {
  const { profile } = useUser()
  const auth = useAuth();
  // const authContext = useContext(AuthContext);
  return (
    <Drawer direction="right">
      <DrawerTrigger asChild>
        <Button variant="outline" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </DrawerTrigger>

      {/* RIGHT-SIDE OVERRIDE */}
      <DrawerContent className="w-40 border-l animate-in slide-in-from-right">
        <DrawerHeader>
          <Activity mode={auth?.isAuthenticated ? "visible" : "hidden"}>
            {auth?.isAuthenticated && (
              <div className="gap-4 mb-6 border-b pb-4">
                <div className="flex flex-col items-center justify-center gap-3">
                  <Avatar className="w-12 h-12">
                    <AvatarImage
                      // src={user?.avatarUrl || "https://cdn-icons-png.flaticon.com/512/168/168726.png"}
                      // alt={user?.username}
                      src={`${profile?.avatarUrl}`} alt="@shadcn"
                    />
                    <AvatarFallback>{`${profile?.firstName?.substring(0, 1) || 'L'}${profile?.lastName?.substring(0, 1) || 'D'}`}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-center justify-center truncate">
                    <span className="font-semibold truncate">{`${profile?.firstName || ''} ${profile?.lastName || ''}`}</span>
                    <span className="text-xs font-medium truncate">{profile?.email}</span>
                    <Link to="/settings/profile"><span className="text-xs font-medium truncate">Go to profile <ChevronRight className="w-4 h-4 m-2 float-right" /></span></Link>
                  </div>
                </div>
              </div>
            )}
          </Activity>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 py-6">
          <Link to="/">
            <Button className="w-full cursor-pointer" variant="ghost">
              Home
            </Button>
          </Link>
          <Link to="/pricing">
            <Button className="w-full cursor-pointer" variant="ghost">
              Pricing
            </Button>
          </Link>
          <Link to="/product">
            <Button className="w-full cursor-pointer" variant="ghost">
              Product
            </Button>
          </Link>
          <Link to="/blog">
            <Button className="w-full cursor-pointer" variant="ghost">
              Blog
            </Button>
          </Link>

          {/* <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="w-full cursor-pointer" variant="ghost">
                Legal
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-65 bg-background hover:bg-background/90 text-center" align="center">
              <DropdownMenuItem>
                <Link to="/" className="w-full block">
                  Terms & Conditions
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Link to="/" className="w-full block">
                  Privacy Policy
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Link to="/" className="w-full block">
                  Service Level Terms
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu> */}

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="legal">
              <AccordionTrigger className="w-full items-center justify-center hover:bg-accent hover:no-underline [&>svg]:hidden">
                Legal
              </AccordionTrigger>

              <AccordionContent className="space-y-2 text-center">
                <Link to="/legal/terms-and-conditions" hash="top" className="block w-full py-2 hover:bg-accent">
                  Terms & Conditions
                </Link>
                <Link to="/legal/privacy-policy" hash="top" className="block w-full py-2 hover:bg-accent">
                  Privacy Policy
                </Link>
                <Link to="/legal/service-level-terms" hash="top" className="block w-full py-2 hover:bg-accent">
                  Service Level Terms
                </Link>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
        <Activity mode={auth?.isAuthenticated ? "visible" : "hidden"}>
          <DrawerFooter>
            <LogoutBtn />
          </DrawerFooter>
        </Activity>
      </DrawerContent>
    </Drawer>
  );
}
