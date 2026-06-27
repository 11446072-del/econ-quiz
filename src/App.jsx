import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

// Supabase client initialization using the Public Anon Key
const supabaseUrl = 'https://nermiqdqttseudbeqwll.supabase.co'
const supabaseKey = 'sb_publishable_d5x0EXj6aBqC_fDOZSxtVg_h0VBWsUh'
const supabase = createClient(supabaseUrl, supabaseKey)

// Helper function to grade fill-in-the-blank questions flexibly
const checkFillInAnswer = (userAns, correctAns) => {
  const cleanUser = (userAns || '').trim().toLowerCase();
  const cleanCorrect = (correctAns || '').trim().toLowerCase();

  // 1. Exact match after simple trim
  if (cleanUser === cleanCorrect) return true;

  // 2. Match after removing all whitespaces (e.g. "國內生產毛額" vs "國內 生產 毛額")
  const noSpaceUser = cleanUser.replace(/\s+/g, '');
  const noSpaceCorrect = cleanCorrect.replace(/\s+/g, '');
  if (noSpaceUser === noSpaceCorrect) return true;

  // 3. Flexibly match list terms separated by commas or spaces
  const hasDelimiters = /、|，|,/.test(cleanCorrect);
  if (hasDelimiters) {
    const correctTerms = cleanCorrect
      .split(/、|，|,/)
      .map(t => t.trim())
      .filter(t => t.length > 0);

    const userTerms = cleanUser
      .split(/、|，|,|\s+/)
      .map(t => t.trim())
      .filter(t => t.length > 0);

    if (correctTerms.length === userTerms.length) {
      return correctTerms.every(term => userTerms.includes(term));
    }
  }

  return false;
};

// Helper function to shuffle an array
const shuffleArray = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export default function App() {
  const [questions, setQuestions] = useState([])
  const [activeQuestions, setActiveQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState(0)
  const [totalScore, setTotalScore] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Practice Configuration States
  const [practiceStarted, setPracticeStarted] = useState(false)
  const [selectedType, setSelectedType] = useState('SINGLE') // 'SINGLE' | 'FILL' | 'MIXED'
  const [selectedVolume, setSelectedVolume] = useState('ALL') // 'ALL' | 'LIMIT'
  
  const scoreCardRef = useRef(null)

  // Fetch quiz questions and options directly from Supabase (CORS allowed for Publishable Key)
  useEffect(() => {
    async function loadQuizData() {
      try {
        setLoading(true)
        setError(null)
        
        // Fetch all questions and their associated options
        const { data, error: fetchError } = await supabase
          .from('quiz_questions')
          .select('*, quiz_options(*)')
        
        if (fetchError) throw fetchError

        if (!data || data.length === 0) {
          throw new Error('Supabase 讀取到 0 筆資料。請確認您的資料表 RLS (Row Level Security) 政策是否已允許匿名讀取 (SELECT)。')
        }

        // Process data: 
        // 1. Sort multiple-choice options alphabetically (A, B, C, D)
        // 2. Sort questions by question_no (QA01..QA26, QB01..QB11)
        const processedQuestions = data.map((q) => {
          if (q.quiz_options && Array.isArray(q.quiz_options)) {
            q.quiz_options.sort((a, b) => a.option_label.localeCompare(b.option_label))
          }
          return q
        }).sort((a, b) => a.question_no.localeCompare(b.question_no))

        setQuestions(processedQuestions)
      } catch (err) {
        console.error('Error fetching quiz data:', err)
        setError('載入失敗原因：' + (err.message || JSON.stringify(err)))
      } finally {
        setLoading(false)
      }
    }

    loadQuizData()
  }, [])

  // MathJax typesetting effect: re-render math whenever active questions load or submit state changes
  useEffect(() => {
    if (window.MathJax && activeQuestions.length > 0) {
      const timer = setTimeout(() => {
        window.MathJax.typesetPromise?.()
          .then(() => {
            console.log('MathJax formulas rendered successfully')
          })
          .catch((err) => console.error('MathJax typeset failed:', err))
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [activeQuestions, practiceStarted, submitted])

  // Reset volume configuration when switching question type
  useEffect(() => {
    setSelectedVolume('ALL')
  }, [selectedType])

  // Handle single-choice radio selections
  const handleSelectAnswer = (questionNo, optionLabel) => {
    if (submitted) return
    setAnswers((prev) => ({
      ...prev,
      [questionNo]: optionLabel
    }))
  }

  // Handle fill-in-the-blank text inputs
  const handleTextChange = (questionNo, text) => {
    if (submitted) return
    setAnswers((prev) => ({
      ...prev,
      [questionNo]: text
    }))
  }

  // Start the practice session with selected configurations
  const handleStartPractice = () => {
    let filtered = [];
    if (selectedType === 'SINGLE') {
      filtered = questions.filter(q => q.question_type === 'SINGLE');
      if (selectedVolume === 'LIMIT') {
        filtered = shuffleArray(filtered).slice(0, 15);
      }
    } else if (selectedType === 'FILL') {
      filtered = questions.filter(q => q.question_type === 'FILL');
      if (selectedVolume === 'LIMIT') {
        filtered = shuffleArray(filtered).slice(0, 5);
      }
    } else {
      // Mixed practice mode
      filtered = [...questions];
      if (selectedVolume === 'LIMIT') {
        filtered = shuffleArray(filtered).slice(0, 20); // Limit mixed to 20 items
      }
    }

    setActiveQuestions(filtered);
    setAnswers({});
    setSubmitted(false);
    setScore(0);
    
    // Calculate total score dynamically for active question subset
    const total = filtered.reduce((sum, q) => sum + (q.score || 0), 0);
    setTotalScore(total);
    setPracticeStarted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Auto-grade and score calculation
  const handleGradeQuiz = (e) => {
    if (e) e.preventDefault()
    
    let computedScore = 0
    activeQuestions.forEach((q) => {
      const userAns = answers[q.question_no] || ''
      const correctAns = q.correct_answer || ''

      if (q.question_type === 'SINGLE') {
        if (userAns === correctAns) {
          computedScore += q.score || 3
        }
      } else if (q.question_type === 'FILL') {
        if (checkFillInAnswer(userAns, correctAns)) {
          computedScore += q.score || 4
        }
      }
    })

    setScore(computedScore)
    setSubmitted(true)

    // Smoothly scroll to the top of the page where the score banner will appear
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Restart / Reset the quiz with same subset
  const handleResetQuiz = () => {
    setAnswers({})
    setSubmitted(false)
    setScore(0)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Go back to the setup config panel
  const handleBackToSetup = () => {
    setPracticeStarted(false)
    setSubmitted(false)
    setAnswers({})
    setActiveQuestions([])
  }

  // Helper to determine if a question was answered correctly
  const isQuestionCorrect = (q) => {
    const userAns = answers[q.question_no] || ''
    const correctAns = q.correct_answer || ''
    if (q.question_type === 'SINGLE') {
      return userAns === correctAns
    } else {
      return checkFillInAnswer(userAns, correctAns)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 px-4">
        <div className="relative w-14 h-14 mb-4">
          <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
        </div>
        <p className="text-base font-medium tracking-wide animate-pulse">載入總體經濟學會考題庫...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 px-4">
        <div className="p-6 rounded-2xl glass-panel max-w-md w-full border border-red-500/20 text-center">
          <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
            <span className="text-red-500 text-xl">⚠️</span>
          </div>
          <h2 className="text-lg font-bold mb-2">載入出錯</h2>
          <p className="text-slate-400 mb-6 text-xs leading-relaxed">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold transition-all"
          >
            重新整理試卷
          </button>
        </div>
      </div>
    )
  }

  const singleQuestionsCount = questions.filter(q => q.question_type === 'SINGLE').length
  const fillQuestionsCount = questions.filter(q => q.question_type === 'FILL').length
  const totalAnswered = Object.keys(answers).filter(key => answers[key] && answers[key].trim?.() !== '').length

  return (
    <div className="min-h-screen pb-24 pt-6 px-3 sm:px-6 max-w-3xl mx-auto">
      
      {/* Mobile Title Header */}
      <header className="text-center mb-6 px-2">
        <span className="inline-block px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[10px] font-bold tracking-wider mb-2">
          Economics Midterm Exam
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-100 via-indigo-100 to-slate-100 mb-1">
          總體經濟學期中會考題庫
        </h1>
        <p className="text-xs text-slate-400">
          題庫總數: {questions.length} 題 • 選擇題 {singleQuestionsCount} 題 • 填空題 {fillQuestionsCount} 題
        </p>
      </header>

      {/* SETUP PRACTICE CONFIGURATION PANEL */}
      {!practiceStarted ? (
        <div className="p-6 rounded-2xl glass-panel border border-slate-800/60 animate-slide-up space-y-6">
          <div className="border-b border-slate-800/80 pb-3 text-center">
            <h2 className="text-base sm:text-lg font-bold text-indigo-200">⚙️ 練習模式設定</h2>
            <p className="text-xs text-slate-400 mt-1">自訂題目類型與範圍，開始高效率複習</p>
          </div>

          {/* 1. Select Question Type */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-indigo-400">1. 選擇題型</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setSelectedType('SINGLE')}
                className={`p-4 rounded-xl text-center border text-xs sm:text-sm font-bold transition-all flex flex-col items-center justify-center gap-1.5 touch-target ${
                  selectedType === 'SINGLE'
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                    : 'border-slate-800 bg-slate-900/30 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="text-base sm:text-lg">📝</span>
                <span>選擇題練習 ({singleQuestionsCount} 題)</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedType('FILL')}
                className={`p-4 rounded-xl text-center border text-xs sm:text-sm font-bold transition-all flex flex-col items-center justify-center gap-1.5 touch-target ${
                  selectedType === 'FILL'
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                    : 'border-slate-800 bg-slate-900/30 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="text-base sm:text-lg">✏️</span>
                <span>填空題練習 ({fillQuestionsCount} 題)</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedType('MIXED')}
                className={`p-4 rounded-xl text-center border text-xs sm:text-sm font-bold transition-all flex flex-col items-center justify-center gap-1.5 touch-target ${
                  selectedType === 'MIXED'
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                    : 'border-slate-800 bg-slate-900/30 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="text-base sm:text-lg">⚡</span>
                <span>混合練習 ({questions.length} 題)</span>
              </button>
            </div>
          </div>

          {/* 2. Select Question Volume */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-indigo-400">2. 題數範圍</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedVolume('ALL')}
                className={`p-4 rounded-xl text-center border text-xs sm:text-sm font-bold transition-all flex flex-col items-center justify-center gap-1.5 touch-target ${
                  selectedVolume === 'ALL'
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                    : 'border-slate-800 bg-slate-900/30 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="text-base">📚</span>
                <span>
                  全部題目 ({
                    selectedType === 'SINGLE' 
                      ? `${singleQuestionsCount} 題` 
                      : selectedType === 'FILL' 
                        ? `${fillQuestionsCount} 題` 
                        : `${questions.length} 題`
                  })
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedVolume('LIMIT')}
                className={`p-4 rounded-xl text-center border text-xs sm:text-sm font-bold transition-all flex flex-col items-center justify-center gap-1.5 touch-target ${
                  selectedVolume === 'LIMIT'
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                    : 'border-slate-800 bg-slate-900/30 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="text-base">🎲</span>
                <span>
                  隨機抽題 ({
                    selectedType === 'SINGLE' 
                      ? '15 題' 
                      : selectedType === 'FILL' 
                        ? '5 題' 
                        : '20 題'
                  })
                </span>
              </button>
            </div>
          </div>

          {/* Start Button */}
          <div className="pt-4 text-center">
            <button
              type="button"
              onClick={handleStartPractice}
              className="w-full sm:w-auto px-12 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-sm font-bold tracking-wider transition-all shadow-lg shadow-indigo-600/15 active:scale-98 touch-target"
            >
              🚀 開始練習
            </button>
          </div>
        </div>
      ) : (
        /* QUIZ PRACTICE CONTAINER */
        <div className="space-y-6 animate-slide-up">
          
          {/* Header Action Button to configure settings */}
          <div className="flex justify-between items-center px-1">
            <button
              type="button"
              onClick={handleBackToSetup}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-bold active:scale-95 touch-target"
            >
              <span>⚙️ 返回模式設定</span>
            </button>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              模式：{selectedType === 'SINGLE' ? '選擇題' : selectedType === 'FILL' ? '填空題' : '混合'} • 題數：{selectedVolume === 'ALL' ? '全部' : '隨機限制'}
            </span>
          </div>

          {/* Submitted Score Card Banner */}
          {submitted && (
            <div 
              ref={scoreCardRef}
              className="p-6 rounded-2xl glass-panel border border-indigo-500/30 score-glow-card text-center relative overflow-hidden animate-slide-up"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 opacity-50"></div>
              <div className="relative z-10">
                <span className="text-3xl mb-1.5 block">🎯</span>
                <h2 className="text-lg font-bold text-indigo-200">得分總覽</h2>
                <div className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400 my-2">
                  {score} <span className="text-base text-slate-400 font-normal">/ {totalScore} 分</span>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  答對率 {Math.round((score / totalScore) * 100)}% • 答對 {activeQuestions.filter(q => isQuestionCorrect(q)).length} / {activeQuestions.length} 題
                </p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <button
                    onClick={handleResetQuiz}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md active:scale-95 touch-target"
                  >
                    重新作答
                  </button>
                  <button
                    onClick={handleBackToSetup}
                    className="px-5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-all active:scale-95 touch-target"
                  >
                    更換模式
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Answering Progress Bar */}
          {!submitted && (
            <div className="p-3.5 rounded-xl glass-panel border border-slate-800/40 flex items-center justify-between text-xs text-slate-300">
              <div>
                答題進度：<span className="font-bold text-indigo-400">{totalAnswered}</span> / {activeQuestions.length}
              </div>
              <div className="w-2/5 bg-slate-800 rounded-full h-1.5 overflow-hidden border border-slate-700/50">
                <div 
                  className="bg-indigo-500 h-full transition-all duration-300"
                  style={{ width: `${(totalAnswered / activeQuestions.length) * 100}%` }}
                ></div>
              </div>
              <div className="text-slate-400">
                總分: <span className="text-slate-200 font-semibold">{totalScore}分</span>
              </div>
            </div>
          )}

          <form onSubmit={handleGradeQuiz} className="space-y-8">
            {activeQuestions.map((q, idx) => {
              const isCorrect = isQuestionCorrect(q)
              const userAns = answers[q.question_no] || ''
              
              if (q.question_type === 'SINGLE') {
                return (
                  <div 
                    key={q.question_no}
                    className={`p-4 rounded-xl glass-card relative transition-all duration-200 ${
                      submitted 
                        ? isCorrect 
                          ? 'border-emerald-500/30 bg-emerald-950/5' 
                          : 'border-rose-500/30 bg-rose-950/5'
                        : ''
                    }`}
                  >
                    <span className="absolute top-2 right-2 text-[9px] font-bold text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                      {q.question_no}
                    </span>

                    {/* Question Header */}
                    <div className="pr-12 mb-3">
                      <h3 className="text-sm sm:text-base font-bold text-slate-100 leading-relaxed">
                        {idx + 1}. <span className="text-xs text-indigo-400 font-normal mr-1">[選擇]</span> {q.question_text}
                      </h3>
                    </div>

                    {/* Choice Grid */}
                    <div className="grid grid-cols-1 gap-2.5">
                      {q.quiz_options?.map((opt) => {
                        const isSelected = userAns === opt.option_label
                        
                        return (
                          <button
                            key={opt.option_id}
                            type="button"
                            disabled={submitted}
                            onClick={() => handleSelectAnswer(q.question_no, opt.option_label)}
                            className={`p-3 rounded-xl text-left border text-xs sm:text-sm font-medium transition-all flex items-start gap-2.5 w-full active:scale-[0.99] touch-target ${
                              submitted
                                ? isSelected
                                  ? isCorrect 
                                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' 
                                    : 'border-rose-500/50 bg-rose-500/10 text-rose-300'
                                  : 'border-slate-900 bg-slate-950/30 text-slate-500 opacity-60'
                                : isSelected
                                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                                  : 'border-slate-800 bg-slate-900/40 text-slate-300'
                            }`}
                          >
                            {/* Inner custom radio */}
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                              isSelected 
                                ? submitted
                                  ? isCorrect ? 'border-emerald-400' : 'border-rose-400'
                                  : 'border-indigo-400'
                                : 'border-slate-600'
                            }`}>
                              <div className={`w-2 h-2 rounded-full ${
                                isSelected 
                                  ? submitted
                                    ? isCorrect ? 'bg-emerald-400' : 'bg-rose-400'
                                    : 'bg-indigo-400'
                                  : 'bg-transparent'
                              }`}></div>
                            </div>
                            <span className="leading-relaxed">
                              <strong>{opt.option_label}.</strong> {opt.option_text}
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Feedback corrected answer */}
                    {submitted && !isCorrect && (
                      <div className="mt-3 p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/20 text-xs font-semibold text-rose-400 animate-slide-up">
                        ❌ 答錯了！正確答案是：<span className="font-extrabold underline text-rose-300">{q.correct_answer}</span>
                      </div>
                    )}
                  </div>
                )
              } else {
                // FILL Question Layout
                return (
                  <div 
                    key={q.question_no}
                    className={`p-4 rounded-xl glass-card relative transition-all duration-200 ${
                      submitted 
                        ? isCorrect 
                          ? 'border-emerald-500/30 bg-emerald-950/5' 
                          : 'border-rose-500/30 bg-rose-950/5'
                        : ''
                    }`}
                  >
                    <span className="absolute top-2 right-2 text-[9px] font-bold text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                      {q.question_no}
                    </span>

                    {/* Question Header */}
                    <div className="pr-12 mb-3">
                      <h3 className="text-sm sm:text-base font-bold text-slate-100 leading-relaxed">
                        {idx + 1}. <span className="text-xs text-violet-400 font-normal mr-1">[填空]</span> {q.question_text}
                      </h3>
                    </div>

                    {/* Responsive input box */}
                    <div>
                      <input
                        type="text"
                        disabled={submitted}
                        value={userAns}
                        onChange={(e) => handleTextChange(q.question_no, e.target.value)}
                        placeholder="請在此處輸入答案..."
                        className={`w-full px-3 py-2.5 rounded-lg text-sm font-semibold transition-all border outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                          submitted
                            ? isCorrect
                              ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
                              : 'bg-rose-950/20 border-rose-500/40 text-rose-300'
                            : 'bg-white text-slate-900 border-slate-300 focus:border-indigo-500'
                        }`}
                      />
                    </div>

                    {/* Feedback corrected answer */}
                    {submitted && !isCorrect && (
                      <div className="mt-3 p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/20 text-xs font-semibold text-rose-400 animate-slide-up">
                        ❌ 答錯了！正確答案是：<span className="font-extrabold underline text-rose-300">{q.correct_answer}</span>
                      </div>
                    )}
                  </div>
                )
              }
            })}

            {/* Bottom Form Actions */}
            <div className="text-center pt-4">
              {!submitted ? (
                <button
                  type="submit"
                  disabled={totalAnswered === 0}
                  className={`w-full sm:w-auto px-10 py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-200 active:scale-98 ${
                    totalAnswered === 0
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/10'
                  }`}
                >
                  交卷並計算分數
                </button>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    type="button"
                    onClick={handleResetQuiz}
                    className="w-full sm:w-auto px-10 py-3.5 bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-sm font-bold uppercase tracking-wider transition-all"
                  >
                    重新作答
                  </button>
                  <button
                    type="button"
                    onClick={handleBackToSetup}
                    className="w-full sm:w-auto px-10 py-3.5 bg-indigo-600/10 border border-indigo-500/30 text-indigo-300 rounded-xl text-sm font-bold uppercase tracking-wider transition-all"
                  >
                    返回模式設定
                  </button>
                </div>
              )}
            </div>
          </form>

          {/* Sticky Bottom Actions Bar for mobile screens */}
          {!submitted && totalAnswered > 0 && (
            <div className="fixed bottom-0 left-0 right-0 p-3 bg-slate-950/80 backdrop-blur-md border-t border-slate-800/80 flex items-center justify-between z-40 sm:hidden">
              <div className="text-xs text-slate-300">
                已答: <span className="font-bold text-indigo-400">{totalAnswered}</span> / {activeQuestions.length} 題
              </div>
              <button
                onClick={() => handleGradeQuiz()}
                className="px-4 py-2 bg-indigo-600 active:bg-indigo-500 text-white font-bold rounded-lg text-xs transition-all shadow-md"
              >
                立即交卷
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
