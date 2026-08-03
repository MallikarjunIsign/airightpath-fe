/**
 * Starter code the coding assessment pre-fills per language, plus the check for
 * "the candidate never touched this". Shared so the admin result view grades
 * attempted/not-attempted by the same rule the exam UI uses.
 */
export const LANGUAGE_SKELETONS: Record<string, string> = {
  java: `import java.util.*;

public class Solution {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // Write your solution here

        sc.close();
    }
}
`,
  python: `def solve():
    # Write your solution here
    pass

if __name__ == "__main__":
    solve()
`,
  c: `#include <stdio.h>

int main() {
    // Write your solution here

    return 0;
}
`,
  cpp: `#include <iostream>
using namespace std;

int main() {
    // Write your solution here

    return 0;
}
`,
  javascript: `const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const lines = [];
rl.on('line', (line) => lines.push(line));
rl.on('close', () => {
    // Write your solution here
});
`,
};

/** True when the code is still the untouched starter template (or empty). */
export function isSkeletonCode(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return true;
  return Object.values(LANGUAGE_SKELETONS).some((skeleton) => trimmed === skeleton.trim());
}
