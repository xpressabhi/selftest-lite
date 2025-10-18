import React from 'react';
import { Container } from 'react-bootstrap';

export default function Loading() {
	return (
		<Container className='text-center mt-5'>
			<div className='loader pt-5'></div>
		</Container>
	);
}
