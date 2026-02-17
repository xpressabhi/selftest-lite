'use client';

import dynamic from 'next/dynamic';
import { Container, Card, Badge, Button, Accordion, ListGroup } from 'react-bootstrap';
import Icon from '../components/Icon';
import useBookmarks from '../hooks/useBookmarks';
import { useLanguage } from '../context/LanguageContext';

const MarkdownRenderer = dynamic(
    () => import('../components/MarkdownRenderer'),
    {
        loading: () => <p>...</p>,
        ssr: false,
    },
);

export default function BookmarksPage() {
    const { bookmarks, removeBookmark } = useBookmarks();
    const { t, language } = useLanguage();
    const uiLocale = language === 'hindi' ? 'hi-IN' : 'en-IN';

    const handleRemove = (e, question) => {
        e.stopPropagation();
        if (window.confirm(t('removeBookmarkConfirm'))) {
            removeBookmark(question);
        }
    };

	return (
		<Container style={{ maxWidth: '800px' }}>
            <div className='d-flex align-items-center gap-3 mb-4 mt-4'>
                <Icon name='bookmarkFill' className='text-primary display-6' />
                <div>
                    <h1 className='display-5 fw-bold mb-0'>{t('myBookmarks')}</h1>
                    <p className='text-muted mb-0'>
                        {bookmarks.length}{' '}
                        {bookmarks.length === 1 ? t('savedQuestion') : t('savedQuestions')}
                    </p>
                </div>
            </div>

            {bookmarks.length === 0 ? (
                <Card className='border-0 glass-card shadow-sm text-center py-5'>
                    <Card.Body>
                        <Icon name='bookmark' size={48} className='text-muted opacity-25 mb-3' />
                        <h3 className='text-muted'>{t('noBookmarksYet')}</h3>
                        <p className='text-muted opacity-75'>
                            {t('saveQuestionsForReview')}
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
											{q.bookmarkedAt
												? new Date(q.bookmarkedAt).toLocaleDateString(uiLocale)
												: t('na')}
										</Badge>
                                        <Button
                                            variant='link'
                                            className='text-danger p-0'
                                            onClick={(e) => handleRemove(e, q)}
                                            title={t('removeBookmark')}
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
                                                    {t('showExplanationOptions')}
                                                </span>
                                            </Accordion.Header>
                                            <Accordion.Body className='px-0 pt-3 pb-0'>
                                                <div className='mb-3'>
                                                    <strong>{t('options')}:</strong>
                                                    <ListGroup as="ol">
                                                        {q.options.map((opt, i) => (
                                                            <ListGroup.Item as="li" key={i} className={`mb-1 ${opt === q.answer ? 'text-success fw-bold' : 'text-muted'}`}>
                                                                {opt === q.answer && <Icon name='checkCircle' size={14} className='me-2' />}
                                                                <MarkdownRenderer>{opt}</MarkdownRenderer>
                                                            </ListGroup.Item>
                                                        ))}
                                                    </ListGroup>
                                                </div>
                                                {q.explanation && (
                                                    <div className='bg-light rounded-3 p-3 text-muted'>
                                                        <strong>{t('explanation')}:</strong>
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
