import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import type { BankPaper } from '@/utils/question-bank.utils';

export const questionBankService = {
  /** Every distinct generated or uploaded question paper, with the job it was for. */
  getPapers() {
    return api.get<BankPaper[]>(ENDPOINTS.QUESTION_BANK.LIST);
  },
};
