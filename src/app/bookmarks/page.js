'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Container, Card, Badge, Button, Accordion } from 'react-bootstrap';
import Icon from '../components/Icon';
import useBookmarks from '../hooks/useBookmarks';
import { useLanguage } from '../context/LanguageContext';

const MarkdownRenderer = dynamic(
    () => import('../components/MarkdownRenderer'),
    {
        loading: () => <p>Loading...</p>,
        ssr: false,
    },
);

export default function BookmarksPage() {
    const { bookmarks, removeBookmark } = useBookmarks();
    const { t } = useLanguage();
    const [expandedId, setExpandedId] = useState(null);

    const handleRemove = (e, question) => {
        e.stopPropagation();
        if (window.confirm('Remove this bookmark?')) {
            removeBookmark(question);
        }
    };

    return (
        <Container style={{ maxWidth: '800px' }} className='pb-5'>
            <div className='d-flex align-items-center gap-3 mb-4 mt-4'>
                <Icon name='bookmarkFill' className='text-primary display-6' />
                <div>
                    <h1 className='display-5 fw-bold mb-0'>My Bookmarks</h1>
                    <p className='text-muted mb-0'>
                        {bookmarks.length} saved question{bookmarks.length !== 1 ? 's' : ''}
                    </p>
                </div>
            </div>

            {bookmarks.length === 0 ? (
                <Card className='border-0 glass-card shadow-sm text-center py-5'>
                    <Card.Body>
                        <Icon name='bookmark' size={48} className='text-muted opacity-25 mb-3' />
                        <h3 className='text-muted'>No bookmarks yet</h3>
                        <p className='text-muted opacity-75'>
                            Save interesting questions during tests to review them here later.
                        </p>
                    </Card.Body>
                </Card>
            ) : (
                <div className='d-flex flex-column gap-3'>
                    {bookmarks
                        .sort((a, b) => b.bookmarkedAt - a.bookmarkedAt)
                        .map((q, index) => (
                            <Card
                                key={index}
                                className='border-0 glass-card shadow-sm overflow-hidden'
                            >
                                <Card.Body className='p-4'>
                                    <div className='d-flex justify-content-between align-items-start mb-3'>
                                        <Badge
                                            bg='light'
                                            text='dark'
                                            className='d-flex align-items-center gap-1 px-3 py-2 rounded-pill border'
                                        >
                                            <Icon name='clock' size={12} />
                                            {new Date(q.bookmarkedAt || Date.now()).toLocaleDateString()}
                                        </Badge>
                                        <Button
                                            variant='link'
                                            className='text-danger p-0'
                                            onClick={(e) => handleRemove(e, q)}
                                            title='Remove bookmark'
                                        >
                                            <Icon name='trash' size={20} />
                                        </Button>
                                    </div>

                                    <div className='mb-3 fs-5 fw-medium text-dark'>
                                        <MarkdownRenderer>{q.question}</MarkdownRenderer>
                                    </div>

                                    <div className='p-3 rounded-3 border bg-success bg-opacity-10 border-success mb-3'>
                                        <small className='d-block mb-1 fw-bold text-success text-uppercase' style={{ fontSize: '0.75rem' }}>
                                            {t('correctAnswer')}
                                        </small>
                                        <div className='text-dark'>
                                            <MarkdownRenderer>{q.answer}</MarkdownRenderer>
                                        </div>
                                    </div>

                                    <Accordion flush>
                                        <Accordion.Item eventKey='0' className='border-0 bg-transparent'>
                                            <Accordion.Header className='small p-0'>
                                                <span className='d-flex align-items-center gap-2 text-primary fw-semibold'>
                                                    <Icon name='info' size={16} />
                                                    Show Explanation & Options
                                                </span>
                                            </Accordion.Header>
                                            <Accordion.Body className='px-0 pt-3 pb-0'>
                                                <div className='mb-3'>
                                                    <strong>Options:</strong>
                                                    <ul className='list-unstyled mt-2 ms-2 border-start ps-3'>
                                                        {q.options.map((opt, i) => (
                                                            <li key={i} className={`mb-1 ${opt === q.answer ? 'text-success fw-bold' : 'text-muted'}`}>
                                                                {opt === q.answer && <Icon name='checkCircle' size={14} className='me-2' />}
                                                                {opt}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                {q.explanation && (
                                                    <div className='bg-light rounded-3 p-3 text-muted'>
                                                        <strong>Explanation:</strong>
                                                        <div className='mt-1'>
                                                            <MarkdownRenderer>{q.explanation}</MarkdownRenderer>
                                                        </div>
                                                    </div>
                                                )}
                                            </Accordion.Body>
                                        </Accordion.Item>
                                    </Accordion>
                                </Card.Body>
                            </Card>
                        ))}
                </div>
            )}
        </Container>
    );
}
