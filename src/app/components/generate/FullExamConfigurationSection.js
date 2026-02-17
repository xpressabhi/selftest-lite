'use client';

import { memo } from 'react';
import { Form, Button, Row, Col, Card, Badge } from 'react-bootstrap';
import Icon from '../Icon';

const FullExamConfigurationSection = memo(function FullExamConfigurationSection({
	t,
	examGroupFilters,
	showBookmarkedExamsOnly,
	onBookmarkedOnlyChange,
	showExamBrowser,
	onToggleExamBrowser,
	examSearchQuery,
	onExamSearchQueryChange,
	examGroupFilter,
	onExamGroupFilterChange,
	onClearExamFilters,
	visibleExams,
	selectedExamId,
	onSelectedExamChange,
	onSelectExamFromList,
	isExamBookmarked,
	onToggleExamBookmark,
	selectedExam,
	topic,
	onTopicChange,
	selectedSyllabusFocus,
	onToggleSyllabusFocus,
}) {
	return (
		<div className='d-flex flex-column gap-3'>
			<div className='d-flex flex-wrap justify-content-between align-items-center gap-2'>
				<Form.Label className='small text-muted fw-semibold mb-0'>
					{t('objectiveExamsNoSubjective')}
				</Form.Label>
				<div className='d-flex align-items-center gap-2'>
					<Form.Check
						type='switch'
						id='bookmarked-exams-only'
						label={t('bookmarkedOnly')}
						checked={showBookmarkedExamsOnly}
						onChange={onBookmarkedOnlyChange}
					/>
					<Button
						type='button'
						size='sm'
						variant='outline-secondary'
						className='rounded-pill'
						onClick={onToggleExamBrowser}
					>
						{showExamBrowser ? t('hideList') : t('browseExams')}
					</Button>
				</div>
			</div>

			<Row className='g-2'>
				<Col xs={12} md={7}>
					<Form.Control
						type='text'
						size='sm'
						value={examSearchQuery}
						onChange={onExamSearchQueryChange}
						placeholder={t('searchExamStreamSyllabus')}
						className='glass-input'
					/>
				</Col>
				<Col xs={7} md={3}>
					<Form.Select
						size='sm'
						value={examGroupFilter}
						onChange={onExamGroupFilterChange}
						className='glass-input'
						aria-label={t('filterByGroup')}
					>
						{examGroupFilters.map((group) => (
							<option key={group} value={group}>
								{group === 'all'
									? t('allGroups')
									: `${t('group')} ${group}`}
							</option>
						))}
					</Form.Select>
				</Col>
				<Col xs={5} md={2}>
					<Button
						type='button'
						size='sm'
						variant='outline-secondary'
						className='w-100'
						onClick={onClearExamFilters}
					>
						{t('clear')}
					</Button>
				</Col>
			</Row>

			<div className='small text-muted'>
				{t('showingObjectiveExams')} {visibleExams.length}{' '}
				{t('objectiveExamsInLanguages')}
			</div>

			<Form.Select
				size='sm'
				value={selectedExamId}
				onChange={onSelectedExamChange}
				className='glass-input'
			>
				<option value=''>{t('chooseObjectiveExam')}</option>
				{visibleExams.map((exam) => (
					<option key={exam.id} value={exam.id}>
						{exam.name} • {t('group')} {exam.group} • {exam.stream}
					</option>
				))}
			</Form.Select>

			{showExamBrowser && (
				<div
					className='rounded-3 border bg-white p-2'
					style={{ maxHeight: '220px', overflowY: 'auto' }}
				>
					{visibleExams.map((exam) => {
						const bookmarked = isExamBookmarked(exam.id);
						return (
							<div
								key={exam.id}
								className='px-2 py-2 border-bottom d-flex justify-content-between align-items-start gap-2'
							>
								<div>
									<div className='small fw-semibold text-dark'>{exam.name}</div>
									<div className='small text-muted'>
										{exam.fullLengthQuestions} {t('questionShort')} •{' '}
										{exam.durationMinutes} {t('minuteShort')}
									</div>
									<div className='small text-muted'>
										{t('group')} {exam.group} • {exam.stream}
									</div>
									<div className='small text-muted'>
										{t('languages')}: {exam.availableLanguages.join(' / ')}
									</div>
									{bookmarked && (
										<div className='small text-warning'>
											{t('bookmarkedTag')}
										</div>
									)}
								</div>
								<div className='d-flex align-items-center gap-2'>
									<Button
										type='button'
										size='sm'
										variant={
											selectedExamId === exam.id
												? 'primary'
												: 'outline-secondary'
										}
										onClick={() => onSelectExamFromList(exam.id)}
									>
										{t('select')}
									</Button>
									<Button
										type='button'
										variant='link'
										className='p-0'
										onClick={() => onToggleExamBookmark(exam.id)}
										aria-label={t('bookmarkExam')}
									>
										<Icon
											name={bookmarked ? 'starFill' : 'star'}
											size={18}
											className={bookmarked ? 'text-warning' : 'text-muted'}
										/>
									</Button>
								</div>
							</div>
						);
					})}
				</div>
			)}

			{selectedExam && (
				<Card className='border-0 bg-light bg-opacity-50'>
					<Card.Body className='p-3'>
						<div className='d-flex flex-wrap gap-2 mb-2'>
							<Badge bg='primary'>{t('objective')}</Badge>
							<Badge bg='dark'>
								{t('group')} {selectedExam.group}
							</Badge>
							<Badge bg='secondary'>
								{selectedExam.fullLengthQuestions} {t('questionsLabel')}
							</Badge>
							<Badge bg='secondary'>
								{selectedExam.durationMinutes} {t('minutesLabel')}
							</Badge>
							<Badge bg='info' text='dark'>
								{selectedExam.availableLanguages.join(' / ')}
							</Badge>
						</div>
						<p className='small text-muted mb-2'>{selectedExam.description}</p>
						<Form.Group className='mb-2'>
							<Form.Label className='small text-muted fw-semibold'>
								{t('optionalTopicNotes')}
							</Form.Label>
							<Form.Control
								as='textarea'
								rows={2}
								value={topic}
								onChange={onTopicChange}
								placeholder={t('fullExamInstructionPlaceholder')}
								className='glass-input'
								style={{ resize: 'none' }}
							/>
						</Form.Group>
						<Form.Label className='small text-muted fw-semibold'>
							{t('syllabusFocus')}
						</Form.Label>
						<div className='d-flex flex-wrap gap-2'>
							{selectedExam.syllabus.map((unit) => (
								<Button
									type='button'
									key={unit}
									variant={
										selectedSyllabusFocus.includes(unit)
											? 'primary'
											: 'light'
									}
									size='sm'
									className='rounded-pill'
									onClick={() => onToggleSyllabusFocus(unit)}
								>
									{unit}
								</Button>
							))}
						</div>
						<Form.Text className='small text-muted d-block mt-2'>
							{selectedSyllabusFocus.length} of {selectedExam.syllabus.length}{' '}
							{t('unitsSelected')}
						</Form.Text>
					</Card.Body>
				</Card>
			)}
		</div>
	);
});

export default FullExamConfigurationSection;
