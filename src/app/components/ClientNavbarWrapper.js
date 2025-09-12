'use client';

import dynamic from 'next/dynamic';
import React from 'react';

// This small client wrapper dynamically imports the heavy Navbar component
// with ssr:false which is not allowed in Server Components.
const Navbar = dynamic(() => import('./Navbar'), {
	ssr: false,
	loading: () => <div style={{ height: 56 }} />,
});

export default function ClientNavbarWrapper() {
	return <Navbar />;
}
