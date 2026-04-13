# Géolocalisation — Position de l’utilisateur

## Est-ce que l’utilisateur est obligé d’activer sa localisation ?

Non. L’activation de la localisation n’est pas obligatoire pour utiliser CityTaste.

L’utilisateur peut continuer à naviguer sur le site, consulter les résultats et explorer les lieux même s’il refuse l’accès à sa position. Le site reste utilisable sans géolocalisation.

---


## À quoi sert la localisation ?

La localisation sert surtout à **personnaliser la notion de proximité**.

Quand la position de l’utilisateur est disponible, le système peut mieux interpréter des demandes comme :
- proche de moi
- à quelques kilomètres de ma position
- montre-moi quelque chose près d’ici

Sans position utilisateur, le site peut encore fonctionner, mais la distance affichée repose alors sur une **référence générale** définie par l’application, et non sur la position réelle de la personne.

---

## Que se passe-t-il si l’utilisateur refuse la géolocalisation ?

Si l’utilisateur refuse l’accès à sa position :

- le site continue de fonctionner
- les résultats restent consultables
- les lieux peuvent toujours être filtrés
- la distance n’est simplement pas personnalisée à partir de la position réelle de l’utilisateur

Autrement dit, refuser la géolocalisation n’empêche pas d’utiliser CityTaste. Cela réduit seulement le niveau de personnalisation des résultats liés à la proximité réelle.

---

## Est-ce que la localisation est utilisée pour autre chose que la distance ?

Dans le cadre normal du site, la localisation sert avant tout à améliorer la pertinence des résultats liés à la distance.

Elle n’est pas nécessaire pour :
- consulter les lieux
- lire les fiches
- voir les notes
- filtrer par type ou cuisine

---

## Pourquoi le site peut-il parler du centre-ville ou du centre d’Ottawa ?

Quand la position réelle de l’utilisateur n’est pas disponible, le système peut utiliser une **référence centrale** pour proposer une estimation de distance cohérente. Cela permet d’éviter de bloquer complètement l’expérience utilisateur lorsque la localisation n’est pas activée.

Cette logique est utile, mais elle doit rester clairement expliquée : une distance calculée depuis un point central ne représente pas automatiquement la distance depuis l’adresse réelle de l’utilisateur.

---

## Confidentialité et prudence

CityTaste doit rester transparent sur la géolocalisation :

- la position n’est pas obligatoire
- l’utilisateur doit comprendre pourquoi elle peut être utile
- si elle n’est pas activée, le site doit l’indiquer clairement dans l’interprétation des distances
- le site ne doit pas faire croire qu’une distance est personnalisée si ce n’est pas le cas

---

## Formulations fréquentes

L’utilisateur peut poser des questions comme :

- Est-ce que je suis obligé d’activer ma localisation ?
- Est-ce que le site marche sans ma position ?
- Que se passe-t-il si je refuse l’accès à ma position ?
- Pourquoi le site me demande ma localisation ?
- Est-ce que vous avez besoin de ma position pour trouver des lieux ?
- Puis-je utiliser CityTaste sans géolocalisation ?