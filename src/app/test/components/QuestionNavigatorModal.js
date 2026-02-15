'use client';

import { Button, Modal } from 'react-bootstrap';

export default function QuestionNavigatorModal({
	show,
	onHide,
	questionsCount,
	currentQuestionIndex,
	answers,
	onJump,
}) {
	return (
		<Modal show={show} onHide={onHide} centered>
			<Modal.Header closeButton>
				<Modal.Title>Jump to question</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<div className='navigator-grid'>
					{Array.from({ length: questionsCount }).map((_, qIndex) => {
						const isCurrent = qIndex === currentQuestionIndex;
						const isAnswered = answers[qIndex] !== undefined;
						return (
							<Button
								key={qIndex}
								variant={
									isCurrent
										? 'primary'
										: isAnswered
											? 'outline-success'
											: 'outline-secondary'
								}
								className='rounded-pill navigator-btn'
								onClick={() => onJump(qIndex)}
							>
								{qIndex + 1}
							</Button>
						);
					})}
				</div>
				<style jsx>{`
					.navigator-grid {
						display: grid;
						grid-template-columns: repeat(5, minmax(0, 1fr));
						gap: 8px;
					}

					.navigator-btn {
						min-width: 0;
					}

					@media (max-width: 480px) {
						.navigator-grid {
							grid-template-columns: repeat(4, minmax(0, 1fr));
						}
					}
				`}</style>
			</Modal.Body>
		</Modal>
	);
}
