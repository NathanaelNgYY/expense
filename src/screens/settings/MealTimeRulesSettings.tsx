import { useEffect, useMemo, useState } from 'react'
import { Clock3, Plus, Trash2 } from 'lucide-react'
import {
  fetchAutomaticCategoryRules,
  saveAutomaticCategoryRules,
} from '../../api'
import type { AutomaticCategoryRule } from '../../shared/automaticCategoryRules'
import './MealTimeRulesSettings.css'

interface CategoryOption {
  id: string
  label: string
  icon: string
}

interface Props {
  categoryOptions: CategoryOption[]
  loadRules?: () => Promise<AutomaticCategoryRule[]>
  saveRules?: (rules: AutomaticCategoryRule[]) => Promise<void>
}

type LoadState = 'loading' | 'ready' | 'error'
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function timeValue(minute: number): string {
  const normalized = minute === 1440 ? 0 : minute
  return `${Math.floor(normalized / 60).toString().padStart(2, '0')}:${(normalized % 60).toString().padStart(2, '0')}`
}

function parseTime(value: string): number {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function segments(rule: AutomaticCategoryRule): Array<[number, number]> {
  if (rule.startMinute < rule.endMinute) return [[rule.startMinute, rule.endMinute]]
  return [[rule.startMinute, 1440], [0, rule.endMinute]]
}

function overlappingRules(rules: AutomaticCategoryRule[]): boolean {
  for (let first = 0; first < rules.length; first += 1) {
    for (let second = first + 1; second < rules.length; second += 1) {
      if (segments(rules[first]).some(a =>
        segments(rules[second]).some(b => Math.max(a[0], b[0]) < Math.min(a[1], b[1])),
      )) return true
    }
  }
  return false
}

export default function MealTimeRulesSettings({
  categoryOptions,
  loadRules = fetchAutomaticCategoryRules,
  saveRules = saveAutomaticCategoryRules,
}: Props) {
  const [rules, setRules] = useState<AutomaticCategoryRule[]>([])
  const [savedRules, setSavedRules] = useState<AutomaticCategoryRule[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [saveState, setSaveState] = useState<SaveState>('idle')

  async function load() {
    setLoadState('loading')
    try {
      const loaded = await loadRules()
      setRules(loaded)
      setSavedRules(loaded)
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }

  useEffect(() => {
    let active = true
    void loadRules().then(
      loaded => {
        if (!active) return
        setRules(loaded)
        setSavedRules(loaded)
        setLoadState('ready')
      },
      () => {
        if (active) setLoadState('error')
      },
    )
    return () => { active = false }
  }, [loadRules])

  const dirty = JSON.stringify(rules) !== JSON.stringify(savedRules)
  const hasOverlap = useMemo(() => overlappingRules(rules), [rules])
  const missingCategory = rules.some(rule => !categoryOptions.some(option => option.id === rule.categoryId))

  function addRule() {
    const preferred = categoryOptions.find(option => /dinner/i.test(option.label)) ?? categoryOptions[0]
    if (!preferred || rules.length >= 8) return
    setRules(current => [
      ...current,
      {
        id: crypto.randomUUID(),
        categoryId: preferred.id,
        startMinute: 16 * 60 + 30,
        endMinute: 24 * 60,
      },
    ])
    setSaveState('idle')
  }

  function patchRule(id: string, patch: Partial<AutomaticCategoryRule>) {
    setRules(current => current.map(rule => rule.id === id ? { ...rule, ...patch } : rule))
    setSaveState('idle')
  }

  async function save() {
    if (hasOverlap || missingCategory) return
    setSaveState('saving')
    try {
      await saveRules(rules)
      setSavedRules(rules)
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  return (
    <section className="automatic-rules" aria-labelledby="automatic-rules-title">
      <div className="automatic-rules__header">
        <Clock3 aria-hidden="true" size={19} />
        <div>
          <h2 id="automatic-rules-title">Meal timing</h2>
          <p>Food merchants use Singapore time. Your merchant corrections still take priority.</p>
        </div>
      </div>

      {loadState === 'loading' && <p className="automatic-rules__status">Loading meal timing…</p>}
      {loadState === 'error' && (
        <div className="automatic-rules__load-error" role="alert">
          <p>Could not load meal timing. Your captures will still use merchant matching.</p>
          <button type="button" onClick={() => void load()}>Try again</button>
        </div>
      )}
      {loadState === 'ready' && (
        <>
          {rules.length === 0 ? (
            <p className="automatic-rules__empty">
              Restaurants currently default to Lunch. Add a window for Dinner or any custom category.
            </p>
          ) : (
            <div className="automatic-rules__list">
              {rules.map(rule => (
                <div className="automatic-rules__row" key={rule.id}>
                  <label className="automatic-rules__category">
                    <span>Category</span>
                    <select
                      value={rule.categoryId}
                      onChange={event => patchRule(rule.id, { categoryId: event.target.value })}
                    >
                      {!categoryOptions.some(option => option.id === rule.categoryId) && (
                        <option value={rule.categoryId}>Missing category</option>
                      )}
                      {categoryOptions.map(option => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>From</span>
                    <input
                      type="time"
                      value={timeValue(rule.startMinute)}
                      onChange={event => patchRule(rule.id, { startMinute: parseTime(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>Until</span>
                    <input
                      type="time"
                      value={timeValue(rule.endMinute)}
                      onChange={event => patchRule(rule.id, { endMinute: parseTime(event.target.value) })}
                    />
                  </label>
                  <button
                    type="button"
                    className="automatic-rules__remove"
                    aria-label="Remove time window"
                    onClick={() => setRules(current => current.filter(candidate => candidate.id !== rule.id))}
                  >
                    <Trash2 aria-hidden="true" size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {hasOverlap && <p className="automatic-rules__error" role="alert">Time windows cannot overlap.</p>}
          {missingCategory && <p className="automatic-rules__error" role="alert">Choose an existing category before saving.</p>}

          <div className="automatic-rules__actions">
            <button
              type="button"
              className="automatic-rules__add"
              onClick={addRule}
              disabled={rules.length >= 8 || categoryOptions.length === 0}
            >
              <Plus aria-hidden="true" size={17} />
              Add time window
            </button>
            <button
              type="button"
              className="automatic-rules__save"
              onClick={() => void save()}
              disabled={!dirty || hasOverlap || missingCategory || saveState === 'saving'}
            >
              {saveState === 'saving' ? 'Saving…' : 'Save meal timing'}
            </button>
          </div>
          <div className="automatic-rules__feedback" role="status" aria-live="polite">
            {saveState === 'saved' && 'Meal timing saved'}
            {saveState === 'error' && 'Could not save. Check your connection and try again.'}
          </div>
        </>
      )}
    </section>
  )
}
