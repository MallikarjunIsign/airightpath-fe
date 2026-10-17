import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';
import type { BankAssignment, BankItem, BankSyncStatus } from '@/utils/question-bank.utils';

export const questionBankService = {
  /** Every question, with how often it has been given and to how many different candidates. */
  getItems() {
    return api.get<BankItem[]>(ENDPOINTS.QUESTION_BANK.ITEMS);
  },

  /** Every time one question was given to a candidate, newest first. */
  getAssignments(id: number) {
    return api.get<BankAssignment[]>(ENDPOINTS.QUESTION_BANK.ASSIGNMENTS(id));
  },

  /** Read the papers already in storage into the bank. Runs on the server in the background. */
  startSync() {
    return api.post<BankSyncStatus>(ENDPOINTS.QUESTION_BANK.SYNC);
  },

  getSyncStatus() {
    return api.get<BankSyncStatus>(ENDPOINTS.QUESTION_BANK.SYNC_STATUS, { _skipErrorToast: true } as never);
  },
};
