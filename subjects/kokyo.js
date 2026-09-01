(function () {
    const SUBJECT_ID = "kokyo";
    const SUBJECT_NAME = "公共";
    const SUBJECT_ORDER = 3;

    const questions = [
        // --- 画像を使う問題の例 ---
        // 同じ問題文（例:「この国はどこ？」）を何回使っても、
        // それぞれ別の画像・別の答えとしてきちんと区別されます。
        { "q": "この国はどこ？", "a": "日本", "img": "images/kokyo/country_japan.png" },
        { "q": "この国はどこ？", "a": "アメリカ合衆国", "img": "images/kokyo/country_usa.png" },
        { "q": "この国はどこ？", "a": "中国", "img": "images/kokyo/country_china.png" },
        { "q": "この国旗はどこの国のもの？", "a": "フランス", "img": "images/kokyo/flag_france.png" },
        { "q": "この図は三権分立の仕組みを示している。Aにあてはまる語句は何か。", "a": "違憲立法審査権", "img": "images/kokyo/sanken_bunritsu.png" },

        // --- 画像なしの問題（今まで通りimgキーは書かなくてOK） ---
        { "q": "国民主権・基本的人権の尊重・平和主義からなる、日本国憲法の三原則。", "a": "三大原則" },
        { "q": "国の政治のあり方を最終的に決定する権限が国民にあるという原則。", "a": "国民主権" },
    ];

    window.QUIZ_SUBJECTS = window.QUIZ_SUBJECTS || {};
    window.QUIZ_SUBJECTS[SUBJECT_ID] = {
        id: SUBJECT_ID,
        name: SUBJECT_NAME,
        order: SUBJECT_ORDER,
        questions: questions
    };
})();