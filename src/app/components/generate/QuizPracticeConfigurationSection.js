'use client';

import { memo } from 'react';
import { Form, Button, Row, Col } from 'react-bootstrap';
import Icon from '../Icon';

const QuizPracticeConfigurationSection = memo(function QuizPracticeConfigurationSection({
	t,
	topic,
	onTopicChange,
	showAdvanced,
	onToggleAdvanced,
	onBookmarkCurrentPreset,
	numQuestions,
	onNumQuestionsChange,
	difficulty,
	onDifficultyChange,
	difficultyOptions,
	testType,
	onTestTypeChange,
	formatOptions,
	selectedCategory,
	onClearCategory,
	onCategoryToggle,
	onTopicToggle,
	selectedTopics,
	topicCategories,
}) {
	return (
		<div className='d-flex flex-column gap-3'>
			<Form.Group>
				<Form.Label className='fw-medium'>{t('whatToLearn')}</Form.Label>
				<Form.Control
					as='textarea'
					id='topic'
					rows={4}
					value={topic}
					onChange={onTopicChange}
					placeholder={t('placeholderTopic')}
					className='glass-input'
					style={{ resize: 'none' }}
				/>
			</Form.Group>

			<div className='d-flex flex-wrap justify-content-between align-items-center gap-2'>
				<Button
					type='button'
					variant='link'
					className='text-decoration-none p-0 text-muted d-flex align-items-center gap-2'
					onClick={onToggleAdvanced}
				>
					<Icon name={showAdvanced ? 'chevronUp' : 'chevronDown'} size={14} />
					{showAdvanced ? t('hideOptions') : t('moreOptions')}
				</Button>
				<Button
					type='button'
					variant='outline-secondary'
					size='sm'
					onClick={onBookmarkCurrentPreset}
				>
					{t('bookmarkCurrentPreset')}
				</Button>
			</div>

			{!showAdvanced && (
				<div className='d-flex flex-wrap gap-2'>
					<Form.Select
						size='sm'
						value={numQuestions}
						onChange={onNumQuestionsChange}
						className='glass-input'
						style={{ minWidth: '100px' }}
					>
						{[5, 10, 15, 20].map((num) => (
							<option key={num} value={num}>
								{num} {t('qsShort')}
							</option>
						))}
					</Form.Select>
					<Form.Select
						size='sm'
						value={difficulty}
						onChange={onDifficultyChange}
						className='glass-input'
						style={{ minWidth: '120px' }}
					>
						{difficultyOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</Form.Select>
					<Form.Select
						size='sm'
						value={testType}
						onChange={onTestTypeChange}
						className='glass-input'
						style={{ minWidth: '150px' }}
					>
						{formatOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</Form.Select>
				</div>
			)}

			{showAdvanced && (
				<div className='p-4 rounded-3 bg-light bg-opacity-50 border border-light'>
					<Row className='g-3'>
						<Col xs={6} sm={3}>
							<Form.Label className='small text-muted fw-semibold'>
								{t('questionsHeading')}
							</Form.Label>
							<Form.Select
								size='sm'
								value={numQuestions}
								onChange={onNumQuestionsChange}
								className='glass-input'
							>
								{[5, 10, 15, 20, 25, 30].map((num) => (
									<option key={num} value={num}>
										{num}
									</option>
								))}
							</Form.Select>
						</Col>
						<Col xs={6} sm={3}>
							<Form.Label className='small text-muted fw-semibold'>
								{t('difficultyHeading')}
							</Form.Label>
							<Form.Select
								size='sm'
								value={difficulty}
								onChange={onDifficultyChange}
								className='glass-input'
							>
								{difficultyOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</Form.Select>
						</Col>
						<Col xs={12} sm={6}>
							<Form.Label className='small text-muted fw-semibold'>
								{t('formatHeading')}
							</Form.Label>
							<Form.Select
								size='sm'
								value={testType}
								onChange={onTestTypeChange}
								className='glass-input'
							>
								{formatOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</Form.Select>
						</Col>
					</Row>

					<hr className='my-3 opacity-25' />

					<Form.Label className='small text-muted fw-semibold d-flex justify-content-between'>
						<span>{t('categoryOptional')}</span>
						{selectedCategory && (
							<Button
								type='button'
								variant='link'
								size='sm'
								className='p-0 text-muted text-decoration-none'
								onClick={onClearCategory}
							>
								{t('clear')}
							</Button>
						)}
					</Form.Label>
					<div className='d-flex flex-wrap gap-2 mb-3'>
						{Object.keys(topicCategories).map((category) => (
							<Button
								type='button'
								key={category}
								variant={
									selectedCategory === category
										? 'primary'
										: 'outline-secondary'
								}
								size='sm'
								className={`rounded-pill px-3 ${
									selectedCategory !== category ? 'border-0 bg-white' : ''
								}`}
								onClick={() => onCategoryToggle(category)}
							>
								{category}
							</Button>
						))}
					</div>

					{selectedCategory && (
						<div className='fade-slide fade-in'>
							<Form.Label className='small text-muted fw-semibold'>
								{t('suggestedTopics')}
							</Form.Label>
							<div className='d-flex flex-wrap gap-2'>
								{topicCategories[selectedCategory]?.map((topicItem) => (
									<Button
										type='button'
										key={topicItem}
										variant={
											selectedTopics.includes(topicItem)
												? 'primary'
												: 'light'
										}
										size='sm'
										className='rounded-pill'
										onClick={() => onTopicToggle(topicItem)}
									>
										{topicItem}
									</Button>
								))}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
});

export default QuizPracticeConfigurationSection;
