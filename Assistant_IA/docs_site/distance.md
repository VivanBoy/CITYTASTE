# Distance — Comment l’interpréter dans CityTaste

## Que signifie la distance affichée ?

La distance affichée dans CityTaste sert à donner une **idée de proximité** entre un lieu et un point de référence utilisé par l’application.

Dans une version où la position utilisateur n’est pas activée, la distance correspond généralement à une **distance calculée depuis une référence centrale**, par exemple le centre d’Ottawa. Elle ne représente donc pas automatiquement la distance exacte entre le lieu et l’emplacement réel de l’utilisateur.

---

## La distance est-elle toujours personnalisée ?

Non. La distance n’est personnalisée que si le site dispose réellement de la position de l’utilisateur et si cette fonctionnalité est activée dans l’application.

Sinon :
- le site fonctionne quand même
- mais la distance affichée est une estimation fondée sur une référence générale
- elle doit être comprise comme un indicateur d’ordre de grandeur, pas comme une mesure exacte depuis la personne

---

## Que veut dire “proche du centre” ?

Quand un utilisateur parle d’un lieu “proche du centre”, cela désigne généralement un lieu situé à **faible distance du centre de référence utilisé par le site**.

Dans CityTaste, cela sert à repérer plus facilement des lieux qui semblent centralement situés, sans avoir besoin de connaître l’adresse exacte de l’utilisateur.

---

## Que veut dire “près de moi” ?

L’expression “près de moi” n’a un sens réellement personnalisé que si la position de l’utilisateur est disponible.

Si la géolocalisation n’est pas activée, le site ne doit pas faire croire qu’il connaît la position réelle de la personne. Dans ce cas, il est plus juste de parler :
- de proximité par rapport au centre
- ou d’une distance estimée selon la référence utilisée par l’application

---

## La distance est-elle exacte au mètre près ?

Non. La distance est surtout un **indicateur pratique** pour comparer les résultats. Elle aide l’utilisateur à distinguer un lieu très central d’un lieu plus éloigné, mais elle ne remplace pas un itinéraire réel, une navigation GPS ou un calcul porte-à-porte.

Elle doit être interprétée comme une information utile pour l’exploration, pas comme une promesse de trajet réel.

---

## Pourquoi deux lieux peuvent-ils sembler proches mais ne pas être équivalents ?

Deux lieux peuvent tous les deux être relativement proches du centre, mais rester très différents sur d’autres aspects :
- cuisine
- note
- accessibilité
- horaires
- type d’établissement
- présence ou non d’informations complètes

La distance n’est donc qu’un critère parmi plusieurs.

---

## Formulations fréquentes

L’utilisateur peut poser des questions comme :

- La distance est calculée à partir de quoi ?
- Distance par rapport à quoi ?
- Quand vous dites 5 km, c’est depuis où ?
- Est-ce que c’est la distance depuis moi ?
- Que veut dire proche du centre ?
- Est-ce que la distance est exacte ?
- Pourquoi un lieu est considéré comme proche ?