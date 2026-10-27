/**
 * Starter code the coding assessment pre-fills per language, plus the check for
 * "the candidate never touched this". Shared so the admin result view grades
 * attempted/not-attempted by the same rule the exam UI uses.
 *
 * Every skeleton is a working driver: `main` reads all of stdin, hands it to a
 * `solve` function, and prints whatever comes back. That shape is what makes
 * Custom Input work the moment the exam opens — the previous templates declared
 * a solution function but never wired stdin to it (Python's `solve()` took no
 * arguments and read nothing), so a candidate typing into Custom Input saw it
 * ignored and reasonably concluded the feature was broken.
 *
 * Reading the whole of stdin rather than a fixed number of tokens keeps one
 * template usable for every question: the candidate parses `input` however the
 * problem needs, and the driver never has to change.
 *
 * The parameter is text in every language because stdin is text — a question
 * paper carries no type information (only `sampleInput` / `sampleOutput` and
 * test cases whose input and expectedOutput are both strings), and grading
 * compares printed output against expected output as text. What the driver can
 * do is stop that being the candidate's problem: each template shows the
 * one-liner that turns the input into numbers, and returns a permissive type so
 * a numeric answer prints without being converted first.
 */
export const LANGUAGE_SKELETONS: Record<string, string> = {
  java: `import java.util.*;

public class Solution {

    // Write your solution here.
    // 'input' holds everything from stdin / Custom Input, as text.
    //   one number   -> int n = Integer.parseInt(input.trim());
    //   many numbers -> int[] a = Arrays.stream(input.trim().split("\\\\s+"))
    //                                   .mapToInt(Integer::parseInt).toArray();
    //   line by line -> String[] lines = input.split("\\n");
    // Return anything — a String, an int, a long, a double. It is printed as-is.
    static Object solve(String input) {
        return "";
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        StringBuilder sb = new StringBuilder();
        while (sc.hasNextLine()) {
            sb.append(sc.nextLine()).append('\\n');
        }
        sc.close();
        System.out.println(solve(sb.toString().trim()));
    }
}
`,
  python: `import sys


def solve(input_data):
    # Write your solution here.
    # 'input_data' holds everything from stdin / Custom Input, as text.
    #   one number   -> n = int(input_data)
    #   many numbers -> nums = [int(x) for x in input_data.split()]
    #   line by line -> lines = input_data.splitlines()
    # Return anything - a str, an int, a float. It is printed as-is.
    return ""


if __name__ == "__main__":
    print(solve(sys.stdin.read().strip()))
`,
  c: `#include <stdio.h>
#include <string.h>

/* Write your solution here.
   'input' holds everything from stdin / Custom Input, as text.
     one number   -> int n; sscanf(input, "%d", &n);
     many numbers -> use strtok / sscanf in a loop
   Print the answer yourself, e.g. printf("%d\\n", answer); */
void solve(const char *input) {
    (void)input;
}

int main(void) {
    static char input[1 << 16];
    size_t length = fread(input, 1, sizeof(input) - 1, stdin);
    input[length] = '\\0';
    solve(input);
    return 0;
}
`,
  cpp: `#include <iostream>
#include <string>
#include <sstream>
#include <vector>
#include <algorithm>
using namespace std;

// Write your solution here.
// 'input' holds everything from stdin / Custom Input, as text.
//   one number   -> int n = stoi(input);
//   many numbers -> istringstream ss(input); int x; while (ss >> x) { ... }
// Return a string; for a number use to_string(answer).
string solve(const string &input) {
    return "";
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    string input((istreambuf_iterator<char>(cin)), istreambuf_iterator<char>());
    cout << solve(input) << endl;
    return 0;
}
`,
  javascript: `// Write your solution here.
// 'input' holds everything from stdin / Custom Input, as text.
//   one number   -> const n = Number(input);
//   many numbers -> const nums = input.split(/\\s+/).map(Number);
//   line by line -> const lines = input.split('\\n');
// Return anything - a string or a number. It is printed as-is.
function solve(input) {
    return '';
}

let data = '';
process.stdin.on('data', (chunk) => {
    data += chunk;
});
process.stdin.on('end', () => {
    console.log(solve(data.trim()));
});
`,
};

/**
 * Templates shipped before the drivers above.
 *
 * Kept so "not attempted" keeps meaning the same thing for exams already sat:
 * a candidate who left an old template untouched must not start counting as
 * having attempted the question just because the template was later replaced.
 * Nothing pre-fills these any more — they are only ever compared against.
 */
const RETIRED_SKELETONS: string[] = [
  `import java.util.*;

public class Solution {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // Write your solution here

        sc.close();
    }
}
`,
  `def solve():
    # Write your solution here
    pass

if __name__ == "__main__":
    solve()
`,
  `#include <stdio.h>

int main() {
    // Write your solution here

    return 0;
}
`,
  `#include <iostream>
using namespace std;

int main() {
    // Write your solution here

    return 0;
}
`,
  `const readline = require('readline');
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
];

/** True when the code is still an untouched starter template (or empty). */
export function isSkeletonCode(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return true;
  return [...Object.values(LANGUAGE_SKELETONS), ...RETIRED_SKELETONS].some(
    (skeleton) => trimmed === skeleton.trim()
  );
}
