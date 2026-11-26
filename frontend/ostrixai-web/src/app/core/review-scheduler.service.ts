import { Injectable, inject, signal } from '@angular/core';
import { LocalIdentityService } from './local-identity.service';

/** Study scheduling works with no internet and no generative model. */
export interface ReviewCard {
  readonly id:string; readonly sourceSessionId:string; readonly course:string;
  readonly concept:string; readonly dueDate:string; readonly streak:number;
  readonly attempts:number; readonly lastRating:number|null;
}
function dayOffset(days:number):string {
  const d=new Date(); d.setHours(12,0,0,0);d.setDate(d.getDate()+days);
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
@Injectable({providedIn:'root'})
export class ReviewSchedulerService {
  private readonly identity=inject(LocalIdentityService);
  readonly cards=signal<readonly ReviewCard[]>([]);
  async load():Promise<void> {
    const owner = this.identity.student();
    if (!owner) { this.clear(); return; }
    const cards = await this.identity.list<ReviewCard>('reviews');
    if (owner === this.identity.student()) this.cards.set(cards);
  }
  clear():void {this.cards.set([]);}

  async add(sessionId:string,course:string,concept:string):Promise<void> {
    const owner = this.identity.student();
    const normalized=concept.trim();if(!normalized) return;
    if(this.cards().some(c=>c.sourceSessionId===sessionId&&c.concept===normalized)) return;
    const item:ReviewCard={id:crypto.randomUUID(),sourceSessionId:sessionId,course,
      concept:normalized,dueDate:dayOffset(0),streak:0,attempts:0,lastRating:null};
    await this.identity.save('reviews',item.id,item);
    if (owner !== this.identity.student()) throw new Error('La sesión cambió.');
    this.cards.update(c=>[...c,item]);
  }
  due(course?:string):readonly ReviewCard[] {
    const today=dayOffset(0);
    return this.cards().filter(c=>c.dueDate<=today && (!course||c.course===course))
      .sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  }
  async rate(id:string,rating:0|1|2):Promise<void> {
    const owner = this.identity.student();
    if(![0,1,2].includes(rating))throw new Error('Evaluación inválida.');
    const original=this.cards().find(c=>c.id===id);if(!original)throw new Error('Tarjeta no encontrada.');
    // Lightweight scheduling. This is self-report, NOT an objective mastery estimator.
    const streak=rating===2?original.streak+1:0;
    const interval=rating===0?1:rating===1?2:
      streak===1?3:streak===2?7:streak===3?14:30;
    const updated:ReviewCard={...original,streak,dueDate:dayOffset(interval),
      attempts:original.attempts+1,lastRating:rating};
    await this.identity.save('reviews',updated.id,updated);
    if (owner !== this.identity.student()) throw new Error('La sesión cambió.');
    this.cards.update(items=>items.map(c=>c.id===id?updated:c));
  }
}
