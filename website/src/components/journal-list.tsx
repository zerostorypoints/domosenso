'use client';
import {useState} from 'react';
import {articles,categoryNames} from '@/lib/content';
import {JournalCard} from './journal-cards';
export function JournalList(){
 const [category,setCategory]=useState('');const filtered=articles.filter(a=>!category||a.category===category);
 return <><div className="journal-filters" role="group" aria-label="Article category">{Object.entries({'':'All entries',...categoryNames}).map(([id,label])=><button key={id} type="button" aria-pressed={category===id} onClick={()=>setCategory(id)}>{label}</button>)}</div><p className="mono" aria-live="polite">{filtered.length} entries</p><div className="journal-grid">{filtered.map(article=><JournalCard key={article.slug} article={article}/>)}</div></>;
}
