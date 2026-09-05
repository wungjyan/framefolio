#!/usr/bin/env node

import './commands/build'
import './commands/prepare'
import './commands/start'
import './commands/test'
import './commands/typecheck'
import './commands/web'

import { runProgram } from './program'

await runProgram()
