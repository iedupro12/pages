/* Starting content for each theme (same phrases as the reference images). */
(function () {
  "use strict";
  function pairs(list) { return list.map(function (p) { return { bn: p[0], en: p[1] }; }); }

  window.CARD_SAMPLES = {
    classic: pairs([
      ["তুমি বসো এখানে", "You sit here."],
      ["তুমি ঠিক বলছো", "You are right."],
      ["তুমি কোথায় যাচ্ছো?", "Where are you going?"],
      ["আমরা খুশি আছি", "We are happy."],
      ["আমরা বাড়ি যাচ্ছি", "We are going home."],
      ["আজকে খুব গরম", "Today is very hot."],
      ["এটা সত্যি নয়", "This is not true."]
    ]),
    book: pairs([
      ["দরজাটা বন্ধ করে দাও", "Close the door."],
      ["আলুটা কেটে দাও", "Cut the potatoes."],
      ["চুপ করে থাকো", "Be quiet."],
      ["আমি বাইরে যাচ্ছি", "I'm going outside."],
      ["ভাত রেডি আছে", "The rice is ready."],
      ["এটা আমারটা", "This one is mine."],
      ["মা কোথায়?", "Where is mom?"]
    ]),
    plain: pairs([
      ["সময় শেষ", "Time is up"],
      ["সতর্ক থেকো", "Watch out"],
      ["চুপ করে থাক", "Keep silence"],
      ["এগিয়ে যাও", "Go ahead"],
      ["চা নাও", "Take tea"],
      ["এটা ছেড়ে দাও", "Leave it"],
      ["এটি পড়", "Read this"],
      ["সাহসী হও", "Be brave"],
      ["এখানে থাক", "Stay here"],
      ["ঠিক আছে", "All right"],
      ["জল পান কর", "Drink water"],
      ["শান্ত থাকো", "Keep quiet"],
      ["এই আসছি", "Just coming"],
      ["এটা আনো", "Bring it"],
      ["এর দাম কত", "What does it cost"],
      ["আমি এখানে খাচ্ছি", "I'm eating here"]
    ]),
    dialog: pairs([
      ["এটা বন্ধ করো", "Stop it."],
      ["এটা ঠিক আছে", "It's okay."],
      ["এটা কি সত্যি?", "Is it true?"],
      ["আমি দুঃখিত", "I am sorry."],
      ["এটা কি তোমার?", "Is it yours?"],
      ["আমি এটা পছন্দ করি", "I like it."],
      ["এটা কি সম্ভব?", "Is it possible?"],
      ["এটা আমার ভুল", "It's my fault."],
      ["এটা কি জরুরি?", "Is it urgent?"],
      ["আমাকে সাহায্য করো", "Help me."],
      ["তুমি কি নিশ্চিত?", "Are you sure?"],
      ["তুমি কি প্রস্তুত?", "Are you ready?"],
      ["চালাকি করো না", "Don't be clever."],
      ["এখনকার মতো যাই", "Bye for now."],
      ["আমার কথা শোনো", "Listen to me."],
      ["আমার সঙ্গে এসো", "Come with me."],
      ["আমি অপেক্ষা করছি", "I am waiting."],
      ["আমি পরে আসব", "I will come later."],
      ["আমাকে ভুল বুঝো না", "Don't get me wrong."],
      ["তুমি কি পাগল হয়েছো?", "Are you crazy?"]
    ])
  };
})();
