'use client';

import { Container } from 'react-bootstrap';
import TestHistory from '../components/TestHistory';

export default function HistoryPage() {
    return (
        <Container className="py-4 d-flex justify-content-center">
            <TestHistory />
        </Container>
    );
}
