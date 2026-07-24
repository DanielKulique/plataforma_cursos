#!/usr/bin/env node
'use strict';

// Compatibilidade com o comando histórico: desde o Goal 2, todo dado de teste
// deve vir do seed canônico e somente do banco descartável exato.
process.argv[2] = 'test';
require('./seed_database');
