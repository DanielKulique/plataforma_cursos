'use strict';
jest.mock('../config/database', () => ({getConnection:jest.fn(),query:jest.fn()}));
const {options}=require('../../scripts/reconcile_academic_results');
const {normalizarProgresso}=require('../api/services/academic-progress.service');
const env={NODE_ENV:'test',DB_HOST:'127.0.0.1',DB_PORT:'33307',DB_USER:'lab',DB_PASSWORD:'lab-only',DB_NAME:'plataforma_cursos_test',DB_ENVIRONMENT_IDENTITY:'plataforma_cursos_test'};
test('reconciliation defaults to dry run',()=>expect(options([],env).apply).toBe(false));
test('APPLY requires explicit disposable laboratory authorization',()=>{
    expect(()=>options(['--apply'],env)).toThrow(/laboratório/);
    expect(options(['--apply','--allow-lab-apply'],env).apply).toBe(true);
    const production={...env,NODE_ENV:'production',APP_ENV:'production',DB_HOST:'production.invalid',DB_PORT:'3306',DB_NAME:'plataforma_cursos',DB_ENVIRONMENT_IDENTITY:'plataforma_cursos_prod'};
    expect(()=>options(['--apply','--allow-lab-apply'],production)).toThrow(/laboratório/);
    expect(()=>options(['--dry-run','--apply'],env)).toThrow();
});
test.each([[50,'REPROVADO'],[74.99,'REPROVADO'],[75,'APROVADO']])('read projection follows persisted result %s', (percentual,status)=>{
    expect(normalizarProgresso({status_aprovacao:'CURSANDO',prova_final_percentual:percentual,total_conteudos:5,conteudos_concluidos:4})).toMatchObject({status_aprovacao:status,prova_final_percentual:percentual,progresso_percentual:80});
    expect(normalizarProgresso({status_aprovacao:'CANCELADO',prova_final_percentual:percentual})).toMatchObject({status_aprovacao:'CANCELADO'});
});
