import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Icon from '../../components/Icon';

// Blog data
const BLOG_POSTS = {
    'how-to-study-effectively': {
        title: 'How to study effectively with Active Recall',
        date: 'Nov 24, 2024',
        category: 'Study Tips',
        readTime: '5 min read',
        content: (
            <>
                <p className='lead'>
                    Research shows active recall and spaced repetition are among the most
                    effective study techniques. Using practice tests and low-stakes quizzes
                    helps strengthen memory retrieval and identify gaps in knowledge.
                </p>

                <h2 className='mt-5 mb-3'>Active Recall</h2>
                <p>
                    Active recall is the practice of retrieving information from memory, for
                    example by answering quiz questions without looking at notes.
                    selftest.in is built around this principle. Instead of passively reading,
                    you force your brain to work to retrieve the answer.
                </p>
                <div className='alert alert-light border rounded-4 my-4'>
                    <div className='d-flex'>
                        <div className='me-3 text-primary'>
                            <Icon name='lightbulb' size={24} />
                        </div>
                        <div>
                            <strong>Try this:</strong> After reading a page of a textbook, close the book
                            and write down everything you remember. Then open the book and check what you missed.
                        </div>
                    </div>
                </div>

                <h2 className='mt-5 mb-3'>Spaced Repetition</h2>
                <p>
                    <p>
                        Spacing study sessions over time improves long-term retention. Combine
                        generated quizzes with a schedule to get better results. This combats the
                        &quot;Forgetting Curve&quot; — the natural tendency of the brain to forget information over time.
                    </p>
                </p>

                <h2 className='mt-5 mb-3'>Practical Tips</h2>
                <ul className='list-unstyled'>
                    <li className='mb-3 d-flex align-items-start'>
                        <Icon name='checkCircle' className='text-success me-2 mt-1' size={20} />
                        <span>Generate short quizzes on selftest.in and take them regularly.</span>
                    </li>
                    <li className='mb-3 d-flex align-items-start'>
                        <Icon name='checkCircle' className='text-success me-2 mt-1' size={20} />
                        <span>Review explanations for questions you missed to understand the &quot;why&quot;.</span>
                    </li>
                    <li className='mb-3 d-flex align-items-start'>
                        <Icon name='checkCircle' className='text-success me-2 mt-1' size={20} />
                        <span>Keep sessions focused (25-30 mins) and limit duration to avoid fatigue.</span>
                    </li>
                </ul>
            </>
        ),
    },
    'overcoming-exam-anxiety': {
        title: 'Overcoming Exam Anxiety: A Practical Guide',
        date: 'Nov 20, 2024',
        category: 'Wellness',
        readTime: '4 min read',
        content: (
            <>
                <p className='lead'>
                    Exam anxiety is a common experience that can negatively impact performance.
                    However, with the right strategies, you can manage stress and perform your best.
                </p>

                <h2 className='mt-5 mb-3'>Preparation is Key</h2>
                <p>
                    The most effective way to reduce anxiety is to be well-prepared.
                    Using tools like selftest.in to simulate exam conditions can help desensitize
                    you to the pressure of the actual test.
                </p>

                <h2 className='mt-5 mb-3'>Breathing Techniques</h2>
                <p>
                    When you feel panic rising, try the 4-7-8 breathing technique:
                </p>
                <ol>
                    <li>Inhale quietly through the nose for 4 seconds.</li>
                    <li>Hold the breath for 7 seconds.</li>
                    <li>Exhale forcefully through the mouth for 8 seconds.</li>
                </ol>

                <h2 className='mt-5 mb-3'>Positive Visualization</h2>
                <p>
                    Visualize yourself walking into the exam room calmly and answering questions with confidence.
                    Athletes use this technique to improve performance, and it works for students too.
                </p>
            </>
        ),
    },
    'spaced-repetition-explained': {
        title: 'Spaced Repetition: The Secret to Long-Term Memory',
        date: 'Nov 15, 2024',
        category: 'Science',
        readTime: '6 min read',
        content: (
            <>
                <p className='lead'>
                    Why do we forget what we learned just a few days ago? And how can we stop it?
                    The answer lies in a technique called Spaced Repetition.
                </p>

                <h2 className='mt-5 mb-3'>The Forgetting Curve</h2>
                <p>
                    Hermann Ebbinghaus discovered that memory follows an exponential decay curve.
                    Without review, we forget about 50% of new information within a day.
                </p>

                <h2 className='mt-5 mb-3'>How Spaced Repetition Works</h2>
                <p>
                    By reviewing information at increasing intervals (e.g., 1 day, 3 days, 1 week, 1 month),
                    you can reset the forgetting curve and strengthen the memory trace.
                </p>

                <div className='p-4 bg-light rounded-4 my-4'>
                    <h3 className='h5 fw-bold'>How to use it with selftest.in</h3>
                    <p className='mb-0'>
                        Generate a quiz on a topic today. If you score well, wait 3 days before taking another quiz on the same topic.
                        If you struggle, review the material and take another quiz tomorrow.
                    </p>
                </div>
            </>
        ),
    },
    'best-prompts-for-learning': {
        title: 'Best AI Prompts for Generating Study Quizzes',
        date: 'Nov 10, 2024',
        category: 'Guide',
        readTime: '3 min read',
        content: (
            <>
                <p className='lead'>
                    Getting the best results from AI requires good prompting. Here are some tips
                    for generating high-quality study quizzes on selftest.in.
                </p>

                <h2 className='mt-5 mb-3'>Be Specific</h2>
                <p>
                    Instead of &quot;History&quot;, try &quot;Causes of World War I&quot; or &quot;The French Revolution key events&quot;.
                    The more specific your topic, the more targeted the questions will be.
                </p>

                <h2 className='mt-5 mb-3'>Focus on Concepts</h2>
                <p>
                    Ask for questions that test understanding of concepts rather than just rote memorization of dates.
                    For example: &quot;Newton&apos;s Laws of Motion application&quot; instead of just &quot;Physics formulas&quot;.
                </p>

                <h2 className='mt-5 mb-3'>Challenge Yourself</h2>
                <p>
                    Don&apos;t just stick to what you know. Use the tool to find your weak spots.
                    If you consistently get questions wrong in a certain area, that&apos;s where you need to focus your study time.
                </p>
            </>
        ),
    },
};

export async function generateMetadata({ params }) {
    const { slug } = await params;
    const post = BLOG_POSTS[slug];
    if (!post) return { title: 'Article Not Found' };

    return {
        title: `${post.title} — selftest.in`,
        description: post.title,
    };
}

export default async function BlogPost({ params }) {
    const { slug } = await params;
    const post = BLOG_POSTS[slug];

    if (!post) {
        notFound();
    }

    return (
        <main className='container py-5'>
            <div className='row justify-content-center'>
                <div className='col-lg-8'>
                    <Link href='/blog' className='text-decoration-none text-muted mb-4 d-inline-flex align-items-center'>
                        <Icon name='chevronRight' size={16} style={{ transform: 'rotate(180deg)' }} className='me-1' />
                        Back to Blog
                    </Link>

                    <article>
                        <header className='mb-5'>
                            <div className='d-flex align-items-center gap-3 mb-3'>
                                <span className='badge bg-primary-subtle text-primary rounded-pill px-3 py-2'>
                                    {post.category}
                                </span>
                                <span className='text-muted small'>{post.date}</span>
                                <span className='text-muted small'>•</span>
                                <span className='text-muted small'>{post.readTime}</span>
                            </div>
                            <h1 className='display-4 fw-bold mb-4'>{post.title}</h1>
                        </header>

                        <div className='article-content'>
                            {post.content}
                        </div>

                        <hr className='my-5' />

                        <div className='bg-light rounded-4 p-5 text-center'>
                            <h3 className='fw-bold mb-3'>Enjoyed this article?</h3>
                            <p className='text-muted mb-4'>
                                Put these techniques into practice right now. Generate a custom quiz and start learning.
                            </p>
                            <Link href='/' className='btn btn-primary btn-lg rounded-pill px-5'>
                                Generate Quiz
                            </Link>
                        </div>
                    </article>
                </div>
            </div>
        </main>
    );
}
