Kostentracker.module({
 id:'js/server/reise-zahlungen.js',
 dependencies:['getReiseCurrency'],
 session:[],read:['Reisen','ReisenMeta'],write:[],replace:false
},(context,dependencies)=>{
 'use strict';
 function validateImportedPayment(payment) {
  if(!payment||typeof payment.id!=='string'||!/^[-A-Za-z0-9_:]{1,128}$/.test(payment.id))throw new Error('Ungültige Zahlungs-ID.');
  const foreign=payment.foreign;
  if(foreign&&(typeof foreign.amount!=='number'||!Number.isFinite(foreign.amount)||foreign.amount<=0||foreign.amount>1e12||typeof foreign.currency!=='string'||! /^[A-Z]{3}$/.test(foreign.currency)||['EUR','XXX','XTS'].includes(foreign.currency)))throw new Error('Ungültiger Fremdwährungsbetrag.');
  if(!(Number.isInteger(payment.amountCents)&&payment.amountCents>0&&payment.amountCents<=100000000)&&!(payment.amountCents===null&&foreign))throw new Error('Ungültiger Eurobetrag.');
  if(typeof payment.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(payment.date)||!Number.isFinite(Date.parse(payment.date+'T12:00:00Z'))||new Date(payment.date+'T12:00:00Z').toISOString().slice(0,10)!==payment.date)throw new Error('Ungültiges Zahlungsdatum.');
 }
 function travelPaymentCategory(payment,land) {
  const trip=context.repository.view.Reisen?.[land]||{},options=Object.keys(trip).filter(k=>Array.isArray(trip[k]));
  const merchant=String(payment.merchant||'').normalize('NFKC').toLowerCase();
  const food=/bäck|baeck|backerei|bakery|restaurant|café|cafe/.test(merchant);
  const preferred=food?'Essen / Trinken':payment.category==='Tanken'?'Transport':payment.category||'Sonstiges';
  return options.includes(preferred)?preferred:options.includes('Sonstiges')?'Sonstiges':options[0]||'';
 }
 function routeTravelPayment(payment) {
  const trips=Object.keys(context.repository.view.Reisen||{}).filter(land=>{
   const meta=context.repository.view.ReisenMeta?.[land];
   const valid=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;
   return valid(meta?.von)&&valid(meta?.bis)&&meta.von<=meta.bis&&payment.date>=meta.von&&payment.date<=meta.bis;
  });
  if(payment.amountCents===null)return {review:'Eurobetrag fehlt. Abgerechneten Eurobetrag ergänzen und Ziel auswählen.',travelCandidates:trips};
  if(trips.some(land=>{const m=context.repository.view.ReisenMeta[land];return payment.date===m.von||payment.date===m.bis;}))return {review:'An- oder Abreisetag: Reise oder Alltag auswählen.',travelCandidates:trips};
  let eligible=trips;
  if(payment.foreign){const matching=trips.filter(land=>dependencies.getReiseCurrency(land)===payment.foreign.currency);if(matching.length)eligible=matching;else return {review:'Fremdwährung passt zu keiner Reise an diesem Tag. Ziel prüfen.',travelCandidates:trips};}
  if(eligible.length>1)return {review:'Mehrere Reisen an diesem Tag. Ziel auswählen.',travelCandidates:eligible};
  if(eligible.length===1){const land=eligible[0],category=travelPaymentCategory(payment,land);return category?{normal:true,destination:{area:'Reisen',land,category}}:{review:'Die Reise hat keine Ausgabenkategorie. Kategorie ergänzen.',travelCandidates:eligible};}
  return {normal:true};
 }
 function importedForeignFx(payment,land) {
  if(payment.foreign&&payment.amountCents>0)return {amount:payment.foreign.amount,currency:payment.foreign.currency,rate:payment.foreign.amount/(payment.amountCents/100),date:payment.date,rateSource:'bank'};
  if(!land||!payment.amountCents)return null;
  const quote=dependencies.getReiseCurrency(land),record=context.repository.view.ReisenMeta?.[land]?.budgetFxRates?.[quote];
  if(quote&&quote!=='EUR'&&record?.base==='EUR'&&record.quote===quote&&Number.isFinite(record.rate)&&record.rate>0&&/^\d{4}-\d{2}-\d{2}$/.test(record.date))return {amount:payment.amountCents/100,currency:'EUR',rate:1,date:record.date,counterCurrency:quote,counterRate:record.rate,rateSource:'reference'};
  return null;
 }
 return {validateImportedPayment,travelPaymentCategory,routeTravelPayment,importedForeignFx};
});
