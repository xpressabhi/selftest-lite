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
        readTime: '8 min read',
        content: (
            <>
                <p className='lead'>
                    Most students study by re-reading their notes or highlighting textbooks.
                    Psychologists call this "passive review," and unfortunately, it's one of the least effective ways to learn.
                    In this guide, we'll explore Active Recall—the most robust, evidence-backed study technique known to science—and how you can use it to cut your study time in half while remembering more.
                </p>

                <h2 className='mt-5 mb-3'>The Illusion of Competence</h2>
                <p>
                    When you read a textbook chapter for the third time, it feels fluent. You recognize the words, so you think you know the material.
                    This is the "illusion of competence." Recognition is not the same as retrieval.
                    Just because you can recognize the information doesn't mean you can recall it when faced with a blank sheet of paper in an exam hall.
                </p>

                <h2 className='mt-5 mb-3'>What is Active Recall?</h2>
                <p>
                    Active Recall (also known as "retrieval practice") involves deliberately trying to retrieve information from your brain without looking at the source material.
                    Every time you force your brain to find a memory, you strengthen the neural pathway to that information.
                </p>
                <p>
                    Think of your memory like a forest. Passive review is like walking on an existing path; it's easy but doesn't change much.
                    Active recall is like hacking a new path through the undergrowth. It's hard work, but once the path is made, it's there to stay.
                </p>

                <div className='alert alert-light border rounded-4 my-4'>
                    <div className='d-flex'>
                        <div className='me-3 text-primary'>
                            <Icon name='lightbulb' size={24} />
                        </div>
                        <div>
                            <strong>The Core Principle:</strong> If it feels easy, you probably aren't learning much.
                            Effective learning should feel mentally taxing. That "strain" you feel is your brain building new connections.
                        </div>
                    </div>
                </div>

                <h2 className='mt-5 mb-3'>How to Implement Active Recall</h2>
                <p>Here are three practical ways to use this technique today:</p>

                <h3 className='h5 fw-bold mt-4'>1. The "Closed Book" Method</h3>
                <p>
                    After reading a section of your textbook, close the book. Take a blank sheet of paper and write down everything you can remember.
                    Draw diagrams, make mind maps, or just list bullet points. Only when you literally cannot remember anything else should you open the book to check what you missed.
                </p>

                <h3 className='h5 fw-bold mt-4'>2. The Feynman Technique</h3>
                <p>
                    Try to explain the concept you just learned in simple terms, as if you were teaching it to a 5-year-old.
                    If you stumble or use jargon to cover up gaps in your understanding, that's a signal you need to review that specific part.
                </p>

                <h3 className='h5 fw-bold mt-4'>3. Practice Testing</h3>
                <p>
                    This is where <strong>selftest.in</strong> shines. Generating quizzes forces you to interact with the material actively.
                    Taking the quiz is the ultimate form of active recall because it simulates the pressure and format of the real exam.
                </p>

                <h2 className='mt-5 mb-3'>Summary</h2>
                <ul className='list-unstyled'>
                    <li className='mb-3 d-flex align-items-start'>
                        <Icon name='checkCircle' className='text-success me-2 mt-1' size={20} />
                        <span>Stop passive re-reading and highlighting.</span>
                    </li>
                    <li className='mb-3 d-flex align-items-start'>
                        <Icon name='checkCircle' className='text-success me-2 mt-1' size={20} />
                        <span>Test yourself constantly using the "Closed Book" method.</span>
                    </li>
                    <li className='mb-3 d-flex align-items-start'>
                        <Icon name='checkCircle' className='text-success me-2 mt-1' size={20} />
                        <span>Embrace the difficulty—mental struggle is a sign of learning.</span>
                    </li>
                </ul>
            </>
        ),
    },
    'overcoming-exam-anxiety': {
        title: 'Overcoming Exam Anxiety: A Practical Guide',
        date: 'Nov 20, 2024',
        category: 'Wellness',
        readTime: '6 min read',
        content: (
            <>
                <p className='lead'>
                    Your palms are sweaty, your heart is racing, and your mind goes blank. We've all been there.
                    Exam anxiety is a physiological response to stress that can sabotage your performance regardless of how well you prepared.
                    The good news? It's manageable with the right toolkit.
                </p>

                <h2 className='mt-5 mb-3'>The Physiology of Panic</h2>
                <p>
                    When you're anxious, your body enters "flight or fight" mode. It diverts blood away from your prefrontal cortex (the logical, thinking part of your brain) to your muscles throughout your body.
                    This is great for running away from a lion, but terrible for solving calculus problems.
                </p>

                <h2 className='mt-5 mb-3'>Strategy 1: Cognitive Reframing</h2>
                <p>
                    Psychologically, anxiety and excitement are very similar states of high arousal.
                    Instead of telling yourself "I am anxious," try telling yourself "I am excited."
                    This simple reframe can trick your brain into viewing the upcoming test as a challenge rather than a threat.
                </p>

                <h2 className='mt-5 mb-3'>Strategy 2: The Physical Reset</h2>
                <p>
                    You can hack your nervous system to calm down using your breath. The most effective method is <strong>Box Breathing</strong>, used by Navy SEALs to stay calm under pressure:
                </p>
                <div className='row my-4'>
                    <div className='col-md-6 mb-3'>
                        <div className='p-4 bg-light rounded-4 h-100'>
                            <h4 className='h6 fw-bold mb-3'>The 4-4-4-4 Method</h4>
                            <ol className='mb-0 ps-3'>
                                <li className='mb-2'>Inhale deeply for 4 seconds</li>
                                <li className='mb-2'>Hold your lungs full for 4 seconds</li>
                                <li className='mb-2'>Exhale slowly for 4 seconds</li>
                                <li>Hold your lungs empty for 4 seconds</li>
                            </ol>
                        </div>
                    </div>
                    <div className='col-md-6 mb-3'>
                        <div className='p-4 bg-primary-subtle text-primary-emphasis rounded-4 h-100'>
                            <div className='d-flex align-items-center mb-3'>
                                <Icon name='activity' size={20} className='me-2' />
                                <h4 className='h6 fw-bold mb-0'>Why it works</h4>
                            </div>
                            <p className='small mb-0'>
                                Rhythmic breathing stimulates the Vagus nerve, which activates your parasympathetic nervous system—your body's "rest and digest" mode—counteracting the stress response immediately.
                            </p>
                        </div>
                    </div>
                </div>

                <h2 className='mt-5 mb-3'>Strategy 3: Descriptive Visualization</h2>
                <p>
                    Don't just visualize getting an 'A'. Visualize the process.
                    Imagine yourself walking into the room, feeling calm. Imagine sitting down, turning over the paper, and knowing the first answer.
                    Imagine getting stuck on a question, taking a deep breath, and moving on to the next one without panicking.
                </p>

                <h2 className='mt-5 mb-3'>Exposure Therapy with Simulations</h2>
                <p>
                    The best way to reduce fear is exposure. The more you put yourself in exam-like conditions, the less scary they become.
                    Use <strong>selftest.in</strong> to create timed quizzes. Sit at a clear desk. Put your phone away.
                    Treat every practice quiz like the real thing. When the actual exam day comes, it will just feel like another practice session.
                </p>
            </>
        ),
    },
    'spaced-repetition-explained': {
        title: 'Spaced Repetition: The Secret to Long-Term Memory',
        date: 'Nov 15, 2024',
        category: 'Science',
        readTime: '7 min read',
        content: (
            <>
                <p className='lead'>
                    Have you ever spent all night cramming for a test, aced it, and then realized two weeks later you'd forgotten almost everything?
                    This is the "binge and purge" cycle of learning. It gets you through the test, but it doesn't build knowledge.
                    Enter Spaced Repetition: the algorithm for wisdom.
                </p>

                <h2 className='mt-5 mb-3'>The Forgetting Curve</h2>
                <p>
                    In the late 19th century, German psychologist Hermann Ebbinghaus memorized thousands of nonsense syllables to map how memory fades over time.
                    He discovered that memory decay is exponential. Without review, we forget about <strong>50% of new information within 24 hours</strong>.
                </p>
                <div className='p-5 bg-light rounded-4 my-4 text-center'>
                    <p className='fst-italic text-muted mb-0'>"Spaced repetition turns the forgetting curve into a retention curve."</p>
                </div>

                <h2 className='mt-5 mb-3'>How it Works</h2>
                <p>
                    The principle is simple: <strong>review information at the moment you are about to forget it.</strong>
                </p>
                <p>
                    If you review too soon (e.g., 5 minutes later), it's too easy and doesn't strengthen the memory.
                    If you review too late, you've already forgotten it and have to relearn from scratch.
                    But if you review it <em>just right</em>—when it's a struggle to recall—your brain reinforces the memory significantly.
                </p>

                <h2 className='mt-5 mb-3'>The Schedule</h2>
                <p>A typical manual spaced repetition schedule might look like this:</p>
                <ul className='list-group list-group-flush rounded-4 overflow-hidden border mb-4'>
                    <li className='list-group-item d-flex justify-content-between align-items-center p-3'>
                        <span>1st Review</span>
                        <span className='badge bg-light text-dark border'>1 day later</span>
                    </li>
                    <li className='list-group-item d-flex justify-content-between align-items-center p-3'>
                        <span>2nd Review</span>
                        <span className='badge bg-light text-dark border'>3 days later</span>
                    </li>
                    <li className='list-group-item d-flex justify-content-between align-items-center p-3'>
                        <span>3rd Review</span>
                        <span className='badge bg-light text-dark border'>1 week later</span>
                    </li>
                    <li className='list-group-item d-flex justify-content-between align-items-center p-3'>
                        <span>4th Review</span>
                        <span className='badge bg-light text-dark border'>1 month later</span>
                    </li>
                </ul>

                <h2 className='mt-5 mb-3'>Automating Spaced Repetition</h2>
                <p>
                    Keeping track of what to review and when in a spreadsheet is tedious. That's why software is essential.
                    Tools like Anki and <strong>selftest.in</strong> handle the scheduling for you.
                    When you take a quiz on selftest.in, identify the topics you struggled with. The platform helps you generate new questions on those specific weak points in your next session.
                </p>

                <h2 className='mt-5 mb-3'>The "Interleaving" Bonus</h2>
                <p>
                    Don't just space out your practice—mix it up. Instead of studying only History for 3 hours, study History, Math, and Biology in interleaved blocks.
                    This "context switching" forces your brain to constantly reload different schemas, which, like active recall, strengthens long-term retention.
                </p>
            </>
        ),
    },
    'best-prompts-for-learning': {
        title: 'Best AI Prompts for Generating Study Quizzes',
        date: 'Nov 10, 2024',
        category: 'Guide',
        readTime: '5 min read',
        content: (
            <>
                <p className='lead'>
                    Artificial Intelligence is the ultimate study buddy—if you know how to talk to it.
                    At selftest.in, we use advanced AI to generate quizzes, but understanding how to craft a good prompt can help you in all aspects of your learning journey.
                    Here is the art of "Prompt Engineering" for students.
                </p>

                <h2 className='mt-5 mb-3'>The Anatomy of a Perfect Prompt</h2>
                <p>
                    A vague prompt like "Help me study biology" will get you a vague response. To get high-quality study materials, your prompt needs four components:
                </p>
                <div className='row g-3 mb-4'>
                    <div className='col-md-6'>
                        <div className='p-3 border rounded-3 h-100'>
                            <strong className='d-block mb-2 text-primary'>1. Persona</strong>
                            Who should the AI act as? (e.g., "Act as a strict university professor...")
                        </div>
                    </div>
                    <div className='col-md-6'>
                        <div className='p-3 border rounded-3 h-100'>
                            <strong className='d-block mb-2 text-primary'>2. Task</strong>
                            What exactly do you want? (e.g., "Create 10 multiple-choice questions...")
                        </div>
                    </div>
                    <div className='col-md-6'>
                        <div className='p-3 border rounded-3 h-100'>
                            <strong className='d-block mb-2 text-primary'>3. Context</strong>
                            What is the level/topic? (e.g., "For a final year undergraduate exam on Molecular Biology...")
                        </div>
                    </div>
                    <div className='col-md-6'>
                        <div className='p-3 border rounded-3 h-100'>
                            <strong className='d-block mb-2 text-primary'>4. Constraints</strong>
                            Format limits? (e.g., "Focus on 'application' questions, not definitions. Provide explanations.")
                        </div>
                    </div>
                </div>

                <h2 className='mt-5 mb-3'>Killer Prompts to Try</h2>

                <h3 className='h5 fw-bold mt-4'>The "Examiner" Prompt</h3>
                <div className='bg-light p-3 rounded-3 font-monospace small mb-3 text-wrap'>
                    "Act as an expert examiner in European History. Generate 5 difficult multiple-choice questions about the causes of WWI. Focus on geopolitical alliances rather than just dates. For each question, provide the correct answer and a detailed explanation of why the distractors are wrong."
                </div>

                <h3 className='h5 fw-bold mt-4'>The "Feynman" Prompt</h3>
                <div className='bg-light p-3 rounded-3 font-monospace small mb-3 text-wrap'>
                    "I am studying Quantum Entanglement. Explain this concept to me in three levels of complexity: 1. Like I'm 5 years old. 2. Like I'm a high school student. 3. Like I'm an undergraduate physics major. Use analogies."
                </div>

                <h3 className='h5 fw-bold mt-4'>The "Gap Filler" Prompt</h3>
                <div className='bg-light p-3 rounded-3 font-monospace small mb-3 text-wrap'>
                    "Here are my notes on Photosynthesis: [Paste Notes]. Identify 3 key concepts I have missed or under-explained, and generate a quiz question for each of those missing concepts."
                </div>

                <h2 className='mt-5 mb-3'>Using selftest.in</h2>
                <p>
                    We've built these best practices directly into our platform. When you enter a topic on selftest.in, our backend constructs a complex prompt chain that ensures coverage, relevance, and difficulty.
                    However, you can guide it! Being specific in your topic input (e.g., typing "Organic Chemistry: Alkenes and Alkynes" instead of just "Chemistry") uses the same principle of <strong>Context</strong> to give you a better quiz.
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
