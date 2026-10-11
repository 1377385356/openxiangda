import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PcFrame } from './pc/PcFrame';
import { MobileFrame } from './mobile/MobileFrame';
/** Custom task pages own this composition; Router and identity remain SDK-owned. */
export function ApplicationFrame({children}:{children:ReactNode}){const location=useLocation();const navigate=useNavigate();const mobile=location.pathname.startsWith('/m/');const canGoBack=Number(window.history.state?.idx||0)>0;const back=()=>canGoBack?navigate(-1):navigate(mobile?'/m/home':'/home',{replace:true});const Frame=mobile?MobileFrame:PcFrame;return <Frame canGoBack={canGoBack} back={back}>{children}</Frame>;}
