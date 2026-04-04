(function () {
  var rail = document.getElementById("offer-rail");
  var prevButton = document.getElementById("offer-prev");
  var nextButton = document.getElementById("offer-next");
  var filterButtons = Array.prototype.slice.call(document.querySelectorAll(".offer-filter-btn"));
  var countLabel = document.getElementById("offer-count");
  var activeFilter = "all";

  var offers = [
    {
      category: "latest",
      title: "Nail Offer June 2",
      text: "Fresh nail look and salon-ready finish.",
      image: "assets/images/nail-feed/nail-offer-01-C7s8EAdicSH.jpg",
      alt: "Nail offer post June 2"
    },
    {
      category: "latest",
      title: "Nail Offer June 1",
      text: "Detailed nail art and softgel styling.",
      image: "assets/images/nail-feed/nail-offer-02-C7qXQ7jtM2C.jpg",
      alt: "Nail offer post June 1"
    },
    {
      category: "latest",
      title: "Nail Offer May 31",
      text: "Clean extension work and glossy finish.",
      image: "assets/images/nail-feed/nail-offer-03-C7nyW2iqd2-.jpg",
      alt: "Nail offer post May 31"
    },
    {
      category: "latest",
      title: "Nail Offer May 30",
      text: "Polished set for everyday glam.",
      image: "assets/images/nail-feed/nail-offer-04-C7lNkg3qRtV.jpg",
      alt: "Nail offer post May 30"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 05",
      text: "Softgel and nail art showcase.",
      image: "assets/images/nail-feed/nail-offer-05-C7iopsTJxAR.jpg",
      alt: "Nail offer gallery image 05"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 06",
      text: "Premium nail work from Enchantress.",
      image: "assets/images/nail-feed/nail-offer-06-C7fvJT0iA0m.jpg",
      alt: "Nail offer gallery image 06"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 07",
      text: "Modern nail style with clean details.",
      image: "assets/images/nail-feed/nail-offer-07-C7eVxbDMq3f.jpg",
      alt: "Nail offer gallery image 07"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 08",
      text: "Soft tones and detailed finish.",
      image: "assets/images/nail-feed/nail-offer-08-C7deuSkijIs.jpg",
      alt: "Nail offer gallery image 08"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 09",
      text: "Nail artistry for everyday and events.",
      image: "assets/images/nail-feed/nail-offer-09-C7a57WhP3by.jpg",
      alt: "Nail offer gallery image 09"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 10",
      text: "Professional salon quality finish.",
      image: "assets/images/nail-feed/nail-offer-10-C7a5snpMIyQ.jpg",
      alt: "Nail offer gallery image 10"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 11",
      text: "Elegant nail look from latest shoots.",
      image: "assets/images/nail-feed/nail-offer-11-C7VwGopvrW5.jpg",
      alt: "Nail offer gallery image 11"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 12",
      text: "Beauty clinic nail style highlight.",
      image: "assets/images/nail-feed/nail-offer-12-C7TLMbFtPVk.jpg",
      alt: "Nail offer gallery image 12"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 13",
      text: "Trending nails and softgel results.",
      image: "assets/images/nail-feed/nail-offer-13-C7QmShAB8ez.jpg",
      alt: "Nail offer gallery image 13"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 14",
      text: "Salon-pro nail detail and shape.",
      image: "assets/images/nail-feed/nail-offer-14-C7LclFNCEku.jpg",
      alt: "Nail offer gallery image 14"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 15",
      text: "Nail art variation from daily posting.",
      image: "assets/images/nail-feed/nail-offer-15-C7Lcd6Arpo2.jpg",
      alt: "Nail offer gallery image 15"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 16",
      text: "Classic plus modern nail composition.",
      image: "assets/images/nail-feed/nail-offer-16-C7I3j17CAaR.jpg",
      alt: "Nail offer gallery image 16"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 17",
      text: "Clean set ideal for soft glam clients.",
      image: "assets/images/nail-feed/nail-offer-17-C7HJlMhv_Jj.jpg",
      alt: "Nail offer gallery image 17"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 18",
      text: "Curated Enchantress nail styles.",
      image: "assets/images/nail-feed/nail-offer-18-C7GSpYLN48u.jpg",
      alt: "Nail offer gallery image 18"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 19",
      text: "Nail shape and detail showcase.",
      image: "assets/images/nail-feed/nail-offer-19-C7EkrAMhP81.jpg",
      alt: "Nail offer gallery image 19"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 20",
      text: "Beauty clinic nails with polished finish.",
      image: "assets/images/nail-feed/nail-offer-20-C7DtvU_NlM4.jpg",
      alt: "Nail offer gallery image 20"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 21",
      text: "Minimal and chic nails from feed.",
      image: "assets/images/nail-feed/nail-offer-21-C7B_wwZP7-K.jpg",
      alt: "Nail offer gallery image 21"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 22",
      text: "Fresh nail service output.",
      image: "assets/images/nail-feed/nail-offer-22-C7BIuBHN-Ji.jpg",
      alt: "Nail offer gallery image 22"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 23",
      text: "Softgel-inspired nail visuals.",
      image: "assets/images/nail-feed/nail-offer-23-C6-j0AliwUx.jpg",
      alt: "Nail offer gallery image 23"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 24",
      text: "Salon post highlight for nail lovers.",
      image: "assets/images/nail-feed/nail-offer-24-C682DmyPKQc.jpg",
      alt: "Nail offer gallery image 24"
    },
    {
      category: "nails",
      title: "Nail Offer Gallery 25",
      text: "Latest curated nail service visual.",
      image: "assets/images/nail-feed/nail-offer-25-C68yV_MPDoM.jpg",
      alt: "Nail offer gallery image 25"
    }
  ];

  if (!rail || !prevButton || !nextButton) {
    return;
  }

  function visibleOffers() {
    if (activeFilter === "all") {
      return offers.slice();
    }
    if (activeFilter === "latest") {
      return offers.filter(function (item) {
        return item.category === "latest";
      });
    }
    return offers.filter(function (item) {
      return item.category === "nails";
    });
  }

  function render() {
    var list = visibleOffers();
    rail.innerHTML = "";

    list.forEach(function (item) {
      var card = document.createElement("article");
      card.className = "highlight-card highlight-rail-card";
      card.innerHTML =
        "<img src='" +
        item.image +
        "' alt='" +
        item.alt +
        "' loading='lazy' />" +
        "<div class='highlight-content'>" +
        "<h3 class='highlight-title'>" +
        item.title +
        "</h3>" +
        "<p class='highlight-text mb-0'>" +
        item.text +
        "</p>" +
        "</div>";

      rail.appendChild(card);
    });

    if (countLabel) {
      countLabel.textContent = list.length + " visual offer" + (list.length === 1 ? "" : "s") + " available";
    }

    rail.scrollLeft = 0;
    updateButtons();
  }

  function cardStep() {
    var firstCard = rail.querySelector(".highlight-rail-card");
    if (!firstCard) {
      return Math.max(rail.clientWidth * 0.8, 240);
    }

    var style = window.getComputedStyle(rail);
    var gap = parseInt(style.columnGap || style.gap || "0", 10);
    if (!isFinite(gap)) {
      gap = 0;
    }

    return firstCard.getBoundingClientRect().width + gap;
  }

  function updateButtons() {
    var maxScrollLeft = rail.scrollWidth - rail.clientWidth;
    prevButton.disabled = rail.scrollLeft <= 2;
    nextButton.disabled = rail.scrollLeft >= maxScrollLeft - 2;
  }

  prevButton.addEventListener("click", function () {
    rail.scrollBy({
      left: -cardStep(),
      behavior: "smooth"
    });
  });

  nextButton.addEventListener("click", function () {
    rail.scrollBy({
      left: cardStep(),
      behavior: "smooth"
    });
  });

  rail.addEventListener("scroll", updateButtons, { passive: true });
  window.addEventListener("resize", updateButtons);

  filterButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      activeFilter = button.getAttribute("data-filter") || "all";
      filterButtons.forEach(function (candidate) {
        candidate.classList.toggle("active", candidate === button);
      });
      render();
    });
  });

  render();
})();
