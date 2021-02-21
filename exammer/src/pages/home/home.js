 let solvedQuestionsNumber = 0,
    QuestionsNumber;

function Choice(id, text) {
    this.id = id;
    this.text = text;
}

function Question(id, text, choices) {
    this.id = id || '';
    this.text = text || '';
    this.choices = choices || '';
}

let currentQuestion = new Question();
let selectedChoiceID = null;

function shuffle(a) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a;
}

function updateProgressBar() {
    $('#progress-bar').width(100 * parseFloat(solvedQuestionsNumber/QuestionsNumber) + '%');
    $('#progress-bar-label').text(toPersianNum(solvedQuestionsNumber) + ' از ' + toPersianNum(QuestionsNumber) + " سوال ");
}

function updateQuestionCard() {
    var myNode = document.getElementById("choicesDiv");
    $("#questionText").text(currentQuestion.text);
    let choices = [];
    for(var i=0; i<currentQuestion.choices.length; i++) {
        var ch = document.createElement("button");
        ch.setAttribute("id", `choice-${currentQuestion.choices[i].id}`);
        ch.setAttribute("cid", currentQuestion.choices[i].id);
        ch.setAttribute("class", "choice");
        ch.setAttribute("type", "button");
        // ch.innerHTML = toPersianNum(i+1) + "-" + currentQuestion.choices[i].text;
        ch.innerHTML = currentQuestion.choices[i].text;
        choices = Array.prototype.concat(choices, ch);
    }
    $("#choicesDiv").html(choices);
    selectedChoiceID = null;
}

function submitAndGetNextQuestion() {
    $('#question-loading').removeClass('loaded');
    $.ajax({
        url: 'https://amirnaderi.ir/exammer/nextQuestion.php',
        type: 'POST',
        data: {'id': id, 'qID': currentQuestion.id, 'cID': selectedChoiceID},
        success: function(response){
            if (selectedChoiceID !== null) {
                solvedQuestionsNumber++;
                updateProgressBar();
            }
            let next = JSON.parse(response);
            if (next == 2) {
                document.getElementById("timerCaption").innerHTML = "آزمون به پایان رسیده است"
                $.ajax({
                    url:'https://amirnaderi.ir/exammer/getScore.php',
                    type: 'POST',
                    data: {'id': id},
                    success: function (response) {
                        console.log(response);
                        let total =  parseInt(response.total || 0);
                        let correct = parseInt(response.correct || 0);
                        let wrong = parseInt(response.wrong || 0);
                        let uid = response.uid;
                        let score = 0;
                        score = parseFloat((correct/ total) * 20) || 0;
                        document.getElementById("timer").innerHTML = score;
                        clearInterval(window.x);
                    }
                });
                $("#questionCard").children().animate({
                    height: 'hide'
                });
            }
            else {
                console.log(response);
                let choices = [];
                for (let item of next) {
                    let c = new Choice(item.CID, item.Choice);
                    choices = Array.prototype.concat(choices, c);
                }
                shuffle(choices);
                currentQuestion = new Question(next[0].QID, next[0].Question, choices);
                updateQuestionCard();
                setTimeout(() => {
                    $(document).scrollTop($('#timerRow').offset().top);
                    }, 300);
                setTimeout(() => {
                    $('#question-loading').addClass('loaded');
                }, 350);
            }

        }
    });
}

function timeState(beginning, duration) {
    // let now = new Date().getTime();
    let now = window.now;
    if (now < beginning) {
        return -1;
    }
    else if (now > beginning + duration) {
        return 1;
    }
    else {
        return 0;
    }
}

let currentState = -1, lastState = -1;

function handleUI() {
    if(window.examInfo.success == '0') {
        document.getElementById("timer").innerHTML = "شما دسترسی لازم برای مشاهده اطلاعات آزمون را ندارید";
        document.getElementById("timerCaption").innerHTML = "خطا";
        clearInterval(window.x);
    }
    else {
        let bt = window.examInfo.beginningTime;
        let du = window.examInfo.examDuration;
        currentState = timeState(bt, du);
        if (currentState != lastState) {
            if (lastState == -1 && currentState == 0) {
                $(function () {
                    $("#ex").animate({
                        height: 'hide'
                    }, 500, function() {
                        $(this).css({display: 'none'});
                    });
                    $('#progress-bar-container').removeClass('not-started');
                    document.getElementById("timerCaption").innerHTML = "زمان باقی مانده";
                    $('#questionCard').html(`
                                    <div class="col s12 m12">
                                        <div class="card">
                                            <div id="question-loading" class="loading-container">
                                                <div class="spinner"></div>
                                            </div>
                                            <div class="card-content white-text">
                                                <p class="content" id="questionText"></p>
                                            </div>
                                            <div class="card-action" id="choicesDiv">
                                            </div>
                                            <div class="card-action next-button-div">
                                                <a id="next" onclick="submitAndGetNextQuestion()" class="waves-effect waves-light btn">سوال بعد</a>
                                            </div>
                                        </div>
                                    </div>                `
                    );
                    submitAndGetNextQuestion(true);
                });
            }

            if ((lastState == 0 || lastState == -1) && currentState == 1) {
                document.getElementById("timerCaption").innerHTML = "آزمون به پایان رسیده است"
                $.ajax({
                    url:'https://amirnaderi.ir/exammer/getScore.php',
                    type: 'POST',
                    data: {'id': id},
                    success: function (response) {
                        console.log(response);
                        let total =  parseInt(response.total || 0);
                        let correct = parseInt(response.correct || 0);
                        let wrong = parseInt(response.wrong || 0);
                        let uid = response.uid;
                        let score = 0;
                        score = parseInt(parseFloat((correct/ total) * 20)) || 0;
                        document.getElementById("timer").innerHTML = score + "نمره شما: ";
                    }
                });

                $("#questionCard").children().animate({
                    height: 'hide'
                });

            }
        }
        //alert(myExam.state);
        if (currentState == 1) {
            clearInterval(window.x);
        }
        else {
            let distance;
            if (currentState == -1) {
                document.getElementById("timerCaption").innerHTML = "مانده تا شروع آزمون";
                distance = bt - window.now;
            }
            else if (currentState == 0) {
                distance = bt + du - window.now;
            }


            var nums = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
            var days = Math.floor(distance / (1000 * 60 * 60 * 24));
            var hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            var seconds = Math.floor((distance % (1000 * 60)) / 1000);

            var daysStr = " روز و ", hoursStr = " ساعت و ", minutesStr = " دقیقه و ", secondsStr = " ثانیه";



            if(days == 0){
                daysStr = "";
                if(hours == 0){
                    hoursStr = "";
                    if(minutes == 0) {
                        minutesStr = "";
                        if(seconds == 0){
                            secondsStr = "";
                        } else {
                            secondsStr = toPersianNum(seconds) + secondsStr;
                        }
                    } else {
                        secondsStr = toPersianNum(seconds) + secondsStr;
                        minutesStr = toPersianNum(minutes) + minutesStr;
                    }
                } else {
                    secondsStr = toPersianNum(seconds) + secondsStr;
                    minutesStr = toPersianNum(minutes) + minutesStr;
                    hoursStr = toPersianNum(hours) + hoursStr;
                }
            } else {
                secondsStr = toPersianNum(seconds) + secondsStr;
                minutesStr = toPersianNum(minutes) + minutesStr;
                hoursStr = toPersianNum(hours) + hoursStr;
                daysStr = toPersianNum(days) + daysStr;
            }

            document.getElementById("timer").innerHTML = daysStr + hoursStr + minutesStr + secondsStr;
        }

        lastState = currentState;
    }
}

$(document).ready(() => {

    $('#page-loading').addClass('loaded');

    //get time from server
    $.ajax({
        url: 'https://amirnaderi.ir/exammer/time.php',
        type: 'POST',
        data: {'id': id},
        success: function (response) {
            window.examInfo = JSON.parse(response);
            QuestionsNumber = window.examInfo.remainingQuestions.C;
            solvedQuestionsNumber = QuestionsNumber - window.examInfo.remainingQuestions.R;
            updateProgressBar();
        }
    });

    // Update the count down every 1 second
    window.x = setInterval(function () {
        if(!window.now) {
            window.now = getNow();
        } else {
            window.now += 1000;
        }
        handleUI();
    }, 1000);

    $(document).on('click', '.choice', function() {
        let thisSelected = $(this).data('selected');
        $('.choice').removeClass('selected');
        $('.choice').data('selected', false);
        $('.choice').blur();
        selectedChoiceID = null;
        if(thisSelected !== true) {
            $(this).addClass('selected');
            $(this).data('selected', true);
            selectedChoiceID = $(this).attr('cid');
        }
    });

});
